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
  ];
  for (const { type, value } of ENUM_ADDITIONS) {
    try {
      await pool.query(`ALTER TYPE ${type} ADD VALUE IF NOT EXISTS '${value}'`);
    } catch (err: any) {
      console.error(`Enum addition failed for ${type}=${value}:`, err);
      throw err;
    }
  }

  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
