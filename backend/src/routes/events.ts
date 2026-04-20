import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';

async function getSocialProof(eventIds: string[], userId: string) {
  if (eventIds.length === 0) return new Map<string, { friends_interested: any[]; friends_plan_count: number }>();
  const interested = (await query(
    `SELECT ei.event_id, u.id, u.phone, u.name, u.username, u.avatar_url, u.created_at
     FROM event_interests ei
     JOIN friendships f ON (ei.user_id = f.requester_id OR ei.user_id = f.addressee_id)
     JOIN users u ON u.id = ei.user_id
     WHERE ei.event_id = ANY($1) AND f.status = 'accepted' AND (f.requester_id = $2 OR f.addressee_id = $2) AND ei.user_id != $2`,
    [eventIds, userId]
  )).rows;

  const planCounts = (await query(
    `SELECT p.linked_event_id as event_id, COUNT(DISTINCT pp.user_id) as cnt
     FROM plans p JOIN plan_participants pp ON pp.plan_id = p.id
     WHERE p.linked_event_id = ANY($1) AND pp.user_id != $2
     GROUP BY p.linked_event_id`,
    [eventIds, userId]
  )).rows;

  const result = new Map<string, { friends_interested: any[]; friends_plan_count: number }>();
  for (const id of eventIds) {
    result.set(id, {
      friends_interested: interested.filter((r: any) => r.event_id === id).map((r: any) => ({
        id: r.id, phone: r.phone, name: r.name, username: r.username, avatar_url: r.avatar_url, created_at: r.created_at,
      })),
      friends_plan_count: Number(planCounts.find((r: any) => r.event_id === id)?.cnt || 0),
    });
  }
  return result;
}

export async function eventRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const { category, date_from, date_to, page = '1', limit = '20' } = request.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lmt = Math.min(parseInt(limit), 100);

    let where = '1=1';
    const params: any[] = [];
    let idx = 1;
    if (category) { where += ` AND e.category = $${idx}`; params.push(category); idx++; }
    if (date_from) { where += ` AND e.starts_at >= $${idx}`; params.push(date_from); idx++; }
    if (date_to) { where += ` AND e.starts_at <= $${idx}`; params.push(date_to); idx++; }

    const countResult = (await query(`SELECT COUNT(*) as total FROM events e WHERE ${where}`, params)).rows[0];
    params.push(lmt, offset);
    const events = (await query(
      `SELECT e.*, v.id as v_id, v.name as v_name, v.description as v_desc, v.address as v_addr, v.lat as v_lat, v.lng as v_lng, v.cover_image_url as v_cover, v.created_at as v_created
       FROM events e JOIN venues v ON e.venue_id = v.id WHERE ${where} ORDER BY e.starts_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    )).rows;

    const eventIds = events.map((e: any) => e.id);
    const social = await getSocialProof(eventIds, userId);

    const result = events.map((e: any) => ({
      id: e.id, venue_id: e.venue_id, title: e.title, description: e.description,
      cover_image_url: e.cover_image_url, starts_at: e.starts_at, ends_at: e.ends_at,
      category: e.category, tags: e.tags, price_info: e.price_info, external_url: e.external_url, created_at: e.created_at,
      venue: { id: e.v_id, name: e.v_name, description: e.v_desc, address: e.v_addr, lat: e.v_lat, lng: e.v_lng, cover_image_url: e.v_cover, created_at: e.v_created },
      ...social.get(e.id),
    }));

    return { events: result, total: parseInt(countResult.total) };
  });

  app.get('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const e = (await query(
      `SELECT e.*, v.id as v_id, v.name as v_name, v.description as v_desc, v.address as v_addr, v.lat as v_lat, v.lng as v_lng, v.cover_image_url as v_cover, v.created_at as v_created
       FROM events e JOIN venues v ON e.venue_id = v.id WHERE e.id = $1`, [id]
    )).rows[0];
    if (!e) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Event not found' });

    const social = await getSocialProof([e.id], userId);
    return { event: {
      id: e.id, venue_id: e.venue_id, title: e.title, description: e.description,
      cover_image_url: e.cover_image_url, starts_at: e.starts_at, ends_at: e.ends_at,
      category: e.category, tags: e.tags, price_info: e.price_info, external_url: e.external_url, created_at: e.created_at,
      venue: { id: e.v_id, name: e.v_name, description: e.v_desc, address: e.v_addr, lat: e.v_lat, lng: e.v_lng, cover_image_url: e.v_cover, created_at: e.v_created },
      ...social.get(e.id),
    }};
  });

  app.post('/:id/interest', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const ev = (await query('SELECT 1 FROM events WHERE id = $1', [id])).rows[0];
    if (!ev) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Event not found' });
    await query(
      `INSERT INTO event_interests (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING`,
      [userId, id]
    );
    return {};
  });

  app.delete('/:id/interest', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    await query('DELETE FROM event_interests WHERE user_id = $1 AND event_id = $2', [userId, id]);
    return reply.code(204).send();
  });

  app.post('/:id/save', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const ev = (await query('SELECT 1 FROM events WHERE id = $1', [id])).rows[0];
    if (!ev) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Event not found' });
    await query(
      `INSERT INTO saved_events (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING`,
      [userId, id]
    );
    return {};
  });

  app.delete('/:id/save', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    await query('DELETE FROM saved_events WHERE user_id = $1 AND event_id = $2', [userId, id]);
    return reply.code(204).send();
  });
}
