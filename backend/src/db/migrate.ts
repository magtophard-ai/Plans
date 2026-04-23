import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENUMS = [
  'event_category',
  'activity_type',
  'friendship_status',
  'place_status',
  'time_status',
  'plan_lifecycle',
  'participant_status',
  'proposal_type',
  'proposal_status',
  'group_role',
  'invitation_type',
  'invitation_status',
  'notification_type',
  'message_type',
  'message_context',
];

async function migrate() {
  console.log('Checking existing types...');
  const existingTypes = new Set<string>();
  const result = await pool.query(`SELECT typname FROM pg_type WHERE typname = ANY($1::text[])`, [ENUMS]);
  for (const row of result.rows) {
    existingTypes.add(row.typname);
  }
  console.log(`Found ${existingTypes.size} existing types:`, [...existingTypes]);

  const sql = readFileSync(join(__dirname, '../../../contracts/mvp/db/001_init.sql'), 'utf8');

  // Split SQL into statements and filter out CREATE TYPE for existing types
  const lines = sql.split('\n');
  const filtered: string[] = [];
  let skipBlock = false;
  let braceDepth = 0;
  let currentTypeName: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for CREATE TYPE statements
    const createMatch = trimmed.match(/^CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(/i);
    if (createMatch) {
      currentTypeName = createMatch[1];
      if (existingTypes.has(currentTypeName)) {
        skipBlock = true;
        braceDepth = 1;
        console.log(`Skipping existing type: ${currentTypeName}`);
        continue;
      }
    }

    if (skipBlock) {
      // Track brace depth
      braceDepth += (line.match(/\(/g) || []).length;
      braceDepth -= (line.match(/\)/g) || []).length;
      if (braceDepth === 0 || (braceDepth <= 0 && trimmed.endsWith(';'))) {
        skipBlock = false;
        currentTypeName = null;
      }
      continue;
    }

    filtered.push(line);
  }

  // Replace CREATE TABLE with CREATE TABLE IF NOT EXISTS
  let finalSql = filtered.join('\n');
  finalSql = finalSql.replace(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ');
  finalSql = finalSql.replace(/CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi, 'CREATE INDEX IF NOT EXISTS ');
  finalSql = finalSql.replace(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS/gi, 'CREATE EXTENSION IF NOT EXISTS');

  // Pre-apply additive column changes introduced after the initial schema, so
  // that any later `CREATE INDEX` in 001_init.sql that references the new
  // column finds it. Must run BEFORE executing init.sql statements.
  const tablesResult = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans'`
  );
  if (tablesResult.rows.length > 0) {
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS share_token text`);
  }

  // Handle constraint creation more gracefully
  console.log('Running filtered migration...');

  // Split into individual statements and execute
  const statements = finalSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.match(/^(BEGIN|COMMIT)$/i));

  for (const stmt of statements) {
    try {
      await pool.query(stmt + ';');
    } catch (err: any) {
      if (err.code === '42710') { // duplicate_object
        console.log(`Skipping (already exists): ${stmt.substring(0, 50)}...`);
      } else if (err.code === '42P07') { // duplicate_table
        console.log(`Skipping table (already exists): ${stmt.substring(0, 50)}...`);
      } else if (err.code === '42704') { // undefined_object - might be a DROP before CREATE
        console.log(`Skipping (reference issue): ${stmt.substring(0, 50)}...`);
      } else {
        console.error(`Error on: ${stmt.substring(0, 100)}...`);
        throw err;
      }
    }
  }

  // Additive enum value migrations (idempotent) — keep newest values at the bottom.
  // Postgres supports ADD VALUE IF NOT EXISTS since 9.6. These run against both
  // fresh and already-initialized databases.
  const ENUM_ADDITIONS: Array<{ type: string; value: string }> = [
    { type: 'notification_type', value: 'friend_request' },
    { type: 'notification_type', value: 'plan_join_via_link' },
  ];
  for (const { type, value } of ENUM_ADDITIONS) {
    try {
      await pool.query(`ALTER TYPE ${type} ADD VALUE IF NOT EXISTS '${value}'`);
    } catch (err: any) {
      console.error(`Enum addition failed for ${type}=${value}:`, err);
      throw err;
    }
  }

  // Additive column migrations introduced after 001_init.sql.
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id text`);

  // Ensure unique index exists (init.sql's plain CREATE INDEX is non-unique; we
  // also want a UNIQUE constraint for safe token lookup).
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_share_token_unique ON plans (share_token)`);
  // Backfill tokens for rows created before this column existed.
  const { rows: missing } = await pool.query(`SELECT id FROM plans WHERE share_token IS NULL`);
  if (missing.length > 0) {
    const { randomBytes } = await import('crypto');
    for (const row of missing) {
      let attempts = 0;
      while (attempts < 5) {
        const token = randomBytes(8).toString('hex');
        try {
          await pool.query(`UPDATE plans SET share_token = $1 WHERE id = $2 AND share_token IS NULL`, [token, row.id]);
          break;
        } catch (err: any) {
          if (err.code === '23505') { attempts++; continue; } // unique_violation — retry
          throw err;
        }
      }
    }
    console.log(`Backfilled share_token for ${missing.length} plans.`);
  }


  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
