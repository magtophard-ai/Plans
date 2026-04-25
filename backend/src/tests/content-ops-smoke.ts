import { pool, query } from '../db/pool.js';
import { createHmac } from 'crypto';
import {
  cancelEventById,
  importNormalizedEvent,
  publishIngestion,
  updateFromIngestion,
} from '../services/contentOps.js';

const API = 'http://localhost:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failCount++;
  }
}

async function api(path: string, token: string, method = 'GET', body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) return res.json();
  return null;
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

function createDevJwt(userId: string) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function createSmokeUser(seed: string, suffix: string) {
  const phone = `+79${seed.slice(-8)}${suffix}`;
  const row = (await query(
    'INSERT INTO users (phone, name, username) VALUES ($1, $2, $3) RETURNING id',
    [phone, `Ops User ${suffix}`, `ops_${seed.slice(-8)}_${suffix}`]
  )).rows[0] as { id: string };
  return { id: row.id, token: createDevJwt(row.id) };
}

function eventPayload(seed: string, startsAt: string, sourceEventKey = `ops-${seed}`) {
  const starts = new Date(startsAt);
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  return {
    source_type: 'manual',
    source_url: `https://example.test/events/${seed}`,
    source_event_key: sourceEventKey,
    title: `Content Ops Smoke ${seed}`,
    description: 'Нормализованное тестовое событие',
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    venue_name: `Ops Venue ${seed}`,
    address: `Ops Street ${seed}`,
    cover_image_url: 'https://placehold.co/600x400/00B894/white?text=Ops',
    external_url: `https://tickets.example.test/${seed}`,
    category: 'music',
    tags: ['ops', 'smoke'],
    price_info: '100 ₽',
  };
}

async function main() {
  console.log('=== Content Ops Smoke Test ===\n');
  const seed = `${Date.now()}`;

  console.log('1. Auth');
  const userA = await createSmokeUser(seed, '00');
  const userB = await createSmokeUser(seed, '11');
  const tokenA = userA.token;
  const userBId = userB.id;
  assert(!!tokenA && !!userBId, 'Two users authenticated');

  console.log('\n2. Import stays internal');
  const original = eventPayload(seed, '2030-05-01T18:00:00.000Z');
  const ingestion = await importNormalizedEvent(original);
  assert(ingestion.state === 'imported', 'Normalized payload imported as ingestion');
  const feedBefore: any = await api('/events', tokenA);
  assert(!feedBefore.events.some((e: any) => e.title === original.title), 'Imported ingestion is not in public /events');

  console.log('\n3. Publish creates visible event');
  const published = await publishIngestion(ingestion.id);
  const eventId = published.eventId;
  const detail: any = await api(`/events/${eventId}`, tokenA);
  assert(detail.event?.id === eventId, 'Published event detail returns 200');
  assert(detail.event?.status === 'published', 'Published event has status=published');
  const feedAfter: any = await api('/events', tokenA);
  assert(feedAfter.events.some((e: any) => e.id === eventId), 'Published event appears in /events');
  const searchAfter: any = await api(`/search/events?q=${encodeURIComponent(original.title)}`, tokenA);
  assert(searchAfter.events.some((e: any) => e.id === eventId), 'Published event appears in /search/events');
  const venueId = detail.event.venue_id as string;
  const venueEvents: any = await api(`/venues/${venueId}/events`, tokenA);
  assert(venueEvents.events.some((e: any) => e.id === eventId), 'Published event appears in venue events');

  console.log('\n4. Duplicate protection');
  const repeated = await importNormalizedEvent(original);
  await updateFromIngestion(repeated.id);
  const sameSourceCount = (await query(
    'SELECT COUNT(*)::int as c FROM events WHERE source_type = $1 AND source_event_key = $2',
    [original.source_type, original.source_event_key]
  )).rows[0].c;
  assert(sameSourceCount === 1, 'Repeated import with same source key does not create duplicate event');

  const duplicatePayload = { ...original, source_event_key: undefined };
  const duplicate = await importNormalizedEvent(duplicatePayload);
  assert(duplicate.state === 'duplicate' && duplicate.duplicate_of_event_id === eventId, 'Fingerprint duplicate is marked as duplicate candidate');
  let duplicateBlocked = false;
  try {
    await publishIngestion(duplicate.id);
  } catch {
    duplicateBlocked = true;
  }
  assert(duplicateBlocked, 'Fingerprint duplicate requires explicit --force-link-event-id');

  console.log('\n5. Update existing event + notifications');
  const planRes: any = await api('/plans', tokenA, 'POST', {
    title: `Plan for ${original.title}`,
    activity_type: 'other',
    linked_event_id: eventId,
    participant_ids: [userBId],
  });
  assert(!!planRes.plan?.id, 'Linked plan created');
  const changed = eventPayload(seed, '2030-05-01T20:00:00.000Z', original.source_event_key);
  const changedIngestion = await importNormalizedEvent(changed);
  const updated = await updateFromIngestion(changedIngestion.id);
  assert(updated.eventId === eventId && updated.action === 'updated', 'Source-key update changes same event id');
  const updatedDetail: any = await api(`/events/${eventId}`, tokenA);
  assert(updatedDetail.event?.starts_at === changed.starts_at, 'Event starts_at updated');
  const timeNotifs: any = await api('/notifications', tokenA);
  assert(
    timeNotifs.notifications.some((n: any) => n.type === 'event_time_changed' && n.payload?.event_id === eventId),
    'Time update creates event_time_changed notification'
  );

  console.log('\n6. Cancel');
  await cancelEventById(eventId, 'Отменено организатором');
  const cancelledDetail: any = await api(`/events/${eventId}`, tokenA);
  assert(cancelledDetail.event?.id === eventId && cancelledDetail.event?.status === 'cancelled', 'Cancelled event detail remains readable');
  const feedCancelled: any = await api('/events', tokenA);
  assert(!feedCancelled.events.some((e: any) => e.id === eventId), 'Cancelled event is hidden from /events');
  const searchCancelled: any = await api(`/search/events?q=${encodeURIComponent(original.title)}`, tokenA);
  assert(!searchCancelled.events.some((e: any) => e.id === eventId), 'Cancelled event is hidden from /search/events');
  const venueCancelled: any = await api(`/venues/${venueId}/events`, tokenA);
  assert(!venueCancelled.events.some((e: any) => e.id === eventId), 'Cancelled event is hidden from venue events');
  const cancelNotifs: any = await api('/notifications', tokenA);
  assert(
    cancelNotifs.notifications.some((n: any) => n.type === 'event_cancelled' && n.payload?.event_id === eventId),
    'Cancel creates event_cancelled notification'
  );

  console.log(`\nDone. Passed: ${passCount}, Failed: ${failCount}`);
  if (failCount > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
