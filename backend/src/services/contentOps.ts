import { readFile } from 'fs/promises';
import type { PoolClient } from 'pg';
import { pool, query } from '../db/pool.js';
import { insertNotification } from '../db/notifications.js';

const EVENT_CATEGORIES = [
  'music',
  'theatre',
  'exhibition',
  'sport',
  'food',
  'party',
  'workshop',
  'other',
] as const;

const EVENT_CATEGORY_SET = new Set<string>(EVENT_CATEGORIES);
const INGESTION_STATES = ['imported', 'duplicate', 'published', 'cancelled'] as const;
const INGESTION_STATE_SET = new Set<string>(INGESTION_STATES);

export type IngestionState = 'imported' | 'duplicate' | 'published' | 'cancelled';

export interface NormalizedEventInput {
  source_type: string;
  source_url?: string | null;
  source_event_key?: string | null;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  address: string;
  cover_image_url: string;
  external_url?: string | null;
  category?: string | null;
  tags?: string[] | null;
  price_info?: string | null;
  operator_note?: string | null;
}

export interface EventIngestionRecord {
  id: string;
  source_type: string;
  source_url: string | null;
  source_event_key: string | null;
  raw_payload: unknown;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  address: string;
  cover_image_url: string;
  external_url: string | null;
  category: string;
  tags: string[];
  price_info: string | null;
  fingerprint: string;
  state: IngestionState;
  linked_event_id: string | null;
  duplicate_of_event_id: string | null;
  operator_note: string | null;
  first_seen_at: string;
  last_seen_at: string;
  published_at: string | null;
  updated_at: string;
}

type EventRow = {
  id: string;
  venue_id: string;
  title: string;
  starts_at: string | Date;
  status: string | null;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseIso(value: string, field: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} must be a valid ISO date`);
  return d.toISOString();
}

function parseTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('tags must be an array of strings');
  return value.map((tag, index) => {
    if (typeof tag !== 'string' || !tag.trim()) throw new Error(`tags[${index}] must be a non-empty string`);
    return tag.trim();
  });
}

function normalizeCategory(value: unknown): string {
  if (value == null) return 'other';
  if (typeof value !== 'string') throw new Error('category must be a string');
  const category = value.trim();
  if (!EVENT_CATEGORY_SET.has(category)) {
    throw new Error(`Unsupported category: ${category}`);
  }
  return category;
}

function buildFingerprint(input: Omit<NormalizedEventInput, 'starts_at' | 'ends_at'> & { starts_at: string }): string {
  const startsAt = new Date(input.starts_at).toISOString().slice(0, 16);
  return [
    normalizeText(input.title),
    normalizeText(input.venue_name),
    normalizeText(input.address),
    startsAt,
  ].join('|');
}

export function normalizeInput(payload: unknown): NormalizedEventInput & {
  description: string;
  starts_at: string;
  ends_at: string;
  tags: string[];
  category: string;
  operator_note: string | null;
  source_url: string | null;
  source_event_key: string | null;
  external_url: string | null;
  price_info: string | null;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Normalized event payload must be a JSON object');
  }
  const input = payload as Record<string, unknown>;
  const startsAt = parseIso(requireString(input.starts_at, 'starts_at'), 'starts_at');
  const endsAt = parseIso(requireString(input.ends_at, 'ends_at'), 'ends_at');
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error('ends_at must be later than starts_at');
  }
  return {
    source_type: requireString(input.source_type, 'source_type'),
    source_url: optionalString(input.source_url),
    source_event_key: optionalString(input.source_event_key),
    title: requireString(input.title, 'title'),
    description: optionalString(input.description) ?? '',
    starts_at: startsAt,
    ends_at: endsAt,
    venue_name: requireString(input.venue_name, 'venue_name'),
    address: requireString(input.address, 'address'),
    cover_image_url: requireString(input.cover_image_url, 'cover_image_url'),
    external_url: optionalString(input.external_url),
    category: normalizeCategory(input.category),
    tags: parseTags(input.tags),
    price_info: optionalString(input.price_info),
    operator_note: optionalString(input.operator_note),
  };
}

export async function readNormalizedEventFile(filePath: string) {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const normalized = normalizeInput(parsed);
  return { raw: parsed, normalized };
}

async function findFingerprintDuplicate(fingerprint: string, ignoreEventId?: string | null) {
  const params = ignoreEventId ? [fingerprint, ignoreEventId] : [fingerprint];
  const extraWhere = ignoreEventId ? 'AND id <> $2' : '';
  const row = (
    await query(
      `SELECT id FROM events WHERE source_fingerprint = $1 ${extraWhere} ORDER BY created_at DESC LIMIT 1`,
      params
    )
  ).rows[0] as { id: string } | undefined;
  return row?.id ?? null;
}

function mapIngestionRow(row: Record<string, unknown>): EventIngestionRecord {
  return {
    id: String(row.id),
    source_type: String(row.source_type),
    source_url: row.source_url == null ? null : String(row.source_url),
    source_event_key: row.source_event_key == null ? null : String(row.source_event_key),
    raw_payload: row.raw_payload,
    title: String(row.title),
    description: String(row.description ?? ''),
    starts_at: row.starts_at instanceof Date ? row.starts_at.toISOString() : String(row.starts_at),
    ends_at: row.ends_at instanceof Date ? row.ends_at.toISOString() : String(row.ends_at),
    venue_name: String(row.venue_name),
    address: String(row.address),
    cover_image_url: String(row.cover_image_url),
    external_url: row.external_url == null ? null : String(row.external_url),
    category: String(row.category),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    price_info: row.price_info == null ? null : String(row.price_info),
    fingerprint: String(row.fingerprint),
    state: String(row.state) as IngestionState,
    linked_event_id: row.linked_event_id == null ? null : String(row.linked_event_id),
    duplicate_of_event_id: row.duplicate_of_event_id == null ? null : String(row.duplicate_of_event_id),
    operator_note: row.operator_note == null ? null : String(row.operator_note),
    first_seen_at: row.first_seen_at instanceof Date ? row.first_seen_at.toISOString() : String(row.first_seen_at),
    last_seen_at: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    published_at: row.published_at == null ? null : row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function getIngestionById(ingestionId: string) {
  const row = (await query('SELECT * FROM event_ingestions WHERE id = $1', [ingestionId])).rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Ingestion not found: ${ingestionId}`);
  return mapIngestionRow(row);
}

export async function listIngestions(state?: string) {
  if (state && !INGESTION_STATE_SET.has(state)) {
    throw new Error(`Unsupported state: ${state}`);
  }
  const params: string[] = [];
  const where = state ? 'WHERE state = $1' : '';
  if (state) params.push(state);
  const rows = (await query(
    `SELECT id, state, source_type, source_event_key, title, venue_name, starts_at, linked_event_id, duplicate_of_event_id, updated_at
     FROM event_ingestions ${where}
     ORDER BY updated_at DESC, first_seen_at DESC`,
    params
  )).rows as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    state: String(row.state),
    source_type: String(row.source_type),
    source_event_key: row.source_event_key == null ? null : String(row.source_event_key),
    title: String(row.title),
    venue_name: String(row.venue_name),
    starts_at: row.starts_at instanceof Date ? row.starts_at.toISOString() : String(row.starts_at),
    linked_event_id: row.linked_event_id == null ? null : String(row.linked_event_id),
    duplicate_of_event_id: row.duplicate_of_event_id == null ? null : String(row.duplicate_of_event_id),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  }));
}

export async function importNormalizedEvent(rawPayload: unknown) {
  const normalized = normalizeInput(rawPayload);
  const fingerprint = buildFingerprint(normalized);
  const sourceKey = normalized.source_event_key;
  const existing = sourceKey
    ? (await query(
        'SELECT * FROM event_ingestions WHERE source_type = $1 AND source_event_key = $2',
        [normalized.source_type, sourceKey]
      )).rows[0] as Record<string, unknown> | undefined
    : undefined;

  if (existing) {
    const existingRow = mapIngestionRow(existing);
    const duplicateOfEventId = existingRow.linked_event_id
      ? null
      : await findFingerprintDuplicate(fingerprint, existingRow.duplicate_of_event_id);
    const nextState: IngestionState = existingRow.linked_event_id
      ? existingRow.state === 'cancelled' ? 'cancelled' : 'published'
      : duplicateOfEventId ? 'duplicate' : 'imported';
    const updated = (
      await query(
        `UPDATE event_ingestions
         SET source_url = $2,
             raw_payload = $3,
             title = $4,
             description = $5,
             starts_at = $6,
             ends_at = $7,
             venue_name = $8,
             address = $9,
             cover_image_url = $10,
             external_url = $11,
             category = $12,
             tags = $13,
             price_info = $14,
             fingerprint = $15,
             state = $16,
             duplicate_of_event_id = $17,
             operator_note = $18,
             last_seen_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          existingRow.id,
          normalized.source_url,
          JSON.stringify(rawPayload),
          normalized.title,
          normalized.description,
          normalized.starts_at,
          normalized.ends_at,
          normalized.venue_name,
          normalized.address,
          normalized.cover_image_url,
          normalized.external_url,
          normalized.category,
          normalized.tags,
          normalized.price_info,
          fingerprint,
          nextState,
          duplicateOfEventId,
          normalized.operator_note,
        ]
      )
    ).rows[0] as Record<string, unknown>;
    return mapIngestionRow(updated);
  }

  const duplicateOfEventId = await findFingerprintDuplicate(fingerprint);
  const state: IngestionState = duplicateOfEventId ? 'duplicate' : 'imported';
  const inserted = (
    await query(
      `INSERT INTO event_ingestions (
         source_type, source_url, source_event_key, raw_payload, title, description,
         starts_at, ends_at, venue_name, address, cover_image_url, external_url,
         category, tags, price_info, fingerprint, state, duplicate_of_event_id, operator_note
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19
       )
       RETURNING *`,
      [
        normalized.source_type,
        normalized.source_url,
        normalized.source_event_key,
        JSON.stringify(rawPayload),
        normalized.title,
        normalized.description,
        normalized.starts_at,
        normalized.ends_at,
        normalized.venue_name,
        normalized.address,
        normalized.cover_image_url,
        normalized.external_url,
        normalized.category,
        normalized.tags,
        normalized.price_info,
        fingerprint,
        state,
        duplicateOfEventId,
        normalized.operator_note,
      ]
    )
  ).rows[0] as Record<string, unknown>;
  return mapIngestionRow(inserted);
}

async function resolveVenue(client: PoolClient, ingestion: EventIngestionRecord, venueId?: string) {
  if (venueId) {
    const row = (await client.query('SELECT id FROM venues WHERE id = $1', [venueId])).rows[0] as { id: string } | undefined;
    if (!row) throw new Error(`Venue not found: ${venueId}`);
    return row.id;
  }

  const existingVenue = (
    await client.query(
      'SELECT id FROM venues WHERE lower(name) = lower($1) AND lower(address) = lower($2) ORDER BY created_at DESC LIMIT 1',
      [ingestion.venue_name, ingestion.address]
    )
  ).rows[0] as { id: string } | undefined;
  if (existingVenue) return existingVenue.id;

  const created = (
    await client.query(
      `INSERT INTO venues (name, description, address, lat, lng, cover_image_url)
       VALUES ($1, '', $2, 0, 0, $3)
       RETURNING id`,
      [ingestion.venue_name, ingestion.address, ingestion.cover_image_url]
    )
  ).rows[0] as { id: string };
  return created.id;
}

async function collectLinkedParticipantIds(client: PoolClient, eventId: string) {
  const rows = (
    await client.query(
      `SELECT DISTINCT pp.user_id
       FROM plans p
       JOIN plan_participants pp ON pp.plan_id = p.id
       WHERE p.linked_event_id = $1`,
      [eventId]
    )
  ).rows as Array<{ user_id: string }>;
  return rows.map((row) => row.user_id);
}

async function emitTimeChangedNotifications(
  client: PoolClient,
  eventId: string,
  eventTitle: string,
  oldStartsAt: string,
  newStartsAt: string
) {
  const userIds = await collectLinkedParticipantIds(client, eventId);
  for (const userId of userIds) {
    await insertNotification(
      userId,
      'event_time_changed',
      { event_id: eventId, event_title: eventTitle, old_starts_at: oldStartsAt, new_starts_at: newStartsAt },
      (sql, params) => client.query(sql, params)
    );
  }
}

async function emitCancelledNotifications(
  client: PoolClient,
  eventId: string,
  eventTitle: string,
  reason: string
) {
  const userIds = await collectLinkedParticipantIds(client, eventId);
  for (const userId of userIds) {
    await insertNotification(
      userId,
      'event_cancelled',
      { event_id: eventId, event_title: eventTitle, cancellation_reason: reason },
      (sql, params) => client.query(sql, params)
    );
  }
}

export async function publishIngestion(ingestionId: string, opts?: { venueId?: string; forceLinkEventId?: string }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ingestion = (
      await client.query('SELECT * FROM event_ingestions WHERE id = $1 FOR UPDATE', [ingestionId])
    ).rows[0] as Record<string, unknown> | undefined;
    if (!ingestion) throw new Error(`Ingestion not found: ${ingestionId}`);
    const record = mapIngestionRow(ingestion);

    if (record.state === 'duplicate' && !opts?.forceLinkEventId) {
      throw new Error('Duplicate candidate requires --force-link-event-id');
    }

    let existingEvent: EventRow | null = null;
    if (opts?.forceLinkEventId) {
      existingEvent = (
        await client.query('SELECT id, venue_id, title, starts_at, status FROM events WHERE id = $1', [opts.forceLinkEventId])
      ).rows[0] as EventRow | undefined ?? null;
      if (!existingEvent) throw new Error(`Event not found: ${opts.forceLinkEventId}`);
    } else if (record.linked_event_id) {
      existingEvent = (
        await client.query('SELECT id, venue_id, title, starts_at, status FROM events WHERE id = $1', [record.linked_event_id])
      ).rows[0] as EventRow | undefined ?? null;
    } else if (record.source_event_key) {
      existingEvent = (
        await client.query(
          `SELECT id, venue_id, title, starts_at, status
           FROM events
           WHERE source_type = $1 AND source_event_key = $2`,
          [record.source_type, record.source_event_key]
        )
      ).rows[0] as EventRow | undefined ?? null;
    }

    const venueId = existingEvent && !opts?.venueId
      ? existingEvent.venue_id
      : await resolveVenue(client, record, opts?.venueId);
    const previousStartsAt = existingEvent?.starts_at instanceof Date
      ? existingEvent.starts_at.toISOString()
      : existingEvent?.starts_at ?? null;
    let eventId: string;
    if (existingEvent) {
      eventId = existingEvent.id;
      await client.query(
        `UPDATE events
         SET venue_id = $2,
             title = $3,
             description = $4,
             cover_image_url = $5,
             starts_at = $6,
             ends_at = $7,
             category = $8,
             tags = $9,
             price_info = $10,
             external_url = $11,
             status = 'published',
             source_type = $12,
             source_url = $13,
             source_event_key = $14,
             source_fingerprint = $15,
             source_updated_at = now(),
             last_ingested_at = now(),
             updated_at = now(),
             cancelled_at = NULL,
             cancellation_reason = NULL
         WHERE id = $1`,
        [
          eventId,
          venueId,
          record.title,
          record.description,
          record.cover_image_url,
          record.starts_at,
          record.ends_at,
          record.category,
          record.tags,
          record.price_info,
          record.external_url,
          record.source_type,
          record.source_url,
          record.source_event_key,
          record.fingerprint,
        ]
      );
    } else {
      const created = (
        await client.query(
          `INSERT INTO events (
             venue_id, title, description, cover_image_url, starts_at, ends_at,
             category, tags, price_info, external_url, status, source_type,
             source_url, source_event_key, source_fingerprint, source_updated_at,
             last_ingested_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, 'published', $11,
             $12, $13, $14, now(),
             now(), now()
           )
           RETURNING id`,
          [
            venueId,
            record.title,
            record.description,
            record.cover_image_url,
            record.starts_at,
            record.ends_at,
            record.category,
            record.tags,
            record.price_info,
            record.external_url,
            record.source_type,
            record.source_url,
            record.source_event_key,
            record.fingerprint,
          ]
        )
      ).rows[0] as { id: string };
      eventId = created.id;
    }

    await client.query(
      `UPDATE event_ingestions
       SET state = 'published',
           linked_event_id = $2,
           duplicate_of_event_id = NULL,
           published_at = COALESCE(published_at, now()),
           updated_at = now()
       WHERE id = $1`,
      [record.id, eventId]
    );

    if (previousStartsAt && previousStartsAt !== record.starts_at) {
      await emitTimeChangedNotifications(client, eventId, record.title, previousStartsAt, record.starts_at);
    }

    await client.query('COMMIT');
    return {
      ingestion: await getIngestionById(record.id),
      eventId,
      action: existingEvent ? 'updated' : 'created',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateFromIngestion(ingestionId: string) {
  const ingestion = await getIngestionById(ingestionId);
  if (!ingestion.linked_event_id && !ingestion.source_event_key) {
    throw new Error('Update requires an ingestion linked to an event or a source_event_key');
  }
  return publishIngestion(ingestionId);
}

export async function cancelEventById(eventId: string, reason: string) {
  const cancellationReason = requireString(reason, 'reason');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = (
      await client.query('SELECT id, title, status FROM events WHERE id = $1 FOR UPDATE', [eventId])
    ).rows[0] as { id: string; title: string; status: string | null } | undefined;
    if (!event) throw new Error(`Event not found: ${eventId}`);

    await client.query(
      `UPDATE events
       SET status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = $2,
           updated_at = now(),
           last_ingested_at = now()
       WHERE id = $1`,
      [eventId, cancellationReason]
    );

    await client.query(
      `UPDATE event_ingestions
       SET state = 'cancelled',
           linked_event_id = $2,
           updated_at = now()
       WHERE linked_event_id = $1`,
      [eventId, eventId]
    );

    if (event.status !== 'cancelled') {
      await emitCancelledNotifications(client, eventId, event.title, cancellationReason);
    }

    await client.query('COMMIT');
    return { eventId, status: 'cancelled' as const };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
