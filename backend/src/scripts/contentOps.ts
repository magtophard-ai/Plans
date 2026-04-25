import 'dotenv/config';
import { pool } from '../db/pool.js';
import {
  cancelEventById,
  getIngestionById,
  importNormalizedEvent,
  listIngestions,
  publishIngestion,
  readNormalizedEventFile,
  updateFromIngestion,
} from '../services/contentOps.js';

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected arg: ${arg}`);
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }
  return args;
}

function requireArg(args: Map<string, string | boolean>, key: string): string {
  const value = args.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${key} is required`);
  return value;
}

function optionalArg(args: Map<string, string | boolean>, key: string): string | undefined {
  const value = args.get(key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

async function run() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === 'import') {
    const file = requireArg(args, 'file');
    const sourceUrl = optionalArg(args, 'source-url');
    const { raw } = await readNormalizedEventFile(file);
    const payload = sourceUrl ? { ...(raw as Record<string, unknown>), source_url: sourceUrl } : raw;
    const ingestion = await importNormalizedEvent(payload);
    print({ ingestion });
    return;
  }

  if (command === 'list') {
    const state = optionalArg(args, 'state');
    print({ ingestions: await listIngestions(state) });
    return;
  }

  if (command === 'show') {
    const ingestionId = requireArg(args, 'ingestion-id');
    print({ ingestion: await getIngestionById(ingestionId) });
    return;
  }

  if (command === 'publish') {
    const ingestionId = requireArg(args, 'ingestion-id');
    const result = await publishIngestion(ingestionId, {
      venueId: optionalArg(args, 'venue-id'),
      forceLinkEventId: optionalArg(args, 'force-link-event-id'),
    });
    print(result);
    return;
  }

  if (command === 'update') {
    const ingestionId = requireArg(args, 'ingestion-id');
    print(await updateFromIngestion(ingestionId));
    return;
  }

  if (command === 'sync') {
    const file = requireArg(args, 'file');
    const sourceUrl = optionalArg(args, 'source-url');
    const { raw } = await readNormalizedEventFile(file);
    const payload = sourceUrl ? { ...(raw as Record<string, unknown>), source_url: sourceUrl } : raw;
    const ingestion = await importNormalizedEvent(payload);
    const result = ingestion.linked_event_id || ingestion.source_event_key
      ? await updateFromIngestion(ingestion.id)
      : { ingestion, skipped: 'not linked to an existing event' };
    print(result);
    return;
  }

  if (command === 'cancel') {
    const eventId = requireArg(args, 'event-id');
    const reason = requireArg(args, 'reason');
    print(await cancelEventById(eventId, reason));
    return;
  }

  throw new Error('Usage: content-ops <import|list|show|publish|update|sync|cancel> [--args]');
}

run()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
