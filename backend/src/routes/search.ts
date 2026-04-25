import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';

export async function searchRoutes(app: FastifyInstance) {
  app.get('/events', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const { q, category, date_from, date_to, page = '1', limit = '20' } = request.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lmt = Math.min(parseInt(limit), 100);

    let where = "e.status = 'published'";
    const params: any[] = [];
    let idx = 1;

    if (q) {
      where += ` AND (e.title ILIKE $${idx} OR EXISTS (SELECT 1 FROM unnest(e.tags) tag WHERE tag ILIKE $${idx}) OR v.name ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }
    if (category) { where += ` AND e.category = $${idx}`; params.push(category); idx++; }
    if (date_from) { where += ` AND e.starts_at >= $${idx}`; params.push(date_from); idx++; }
    if (date_to) { where += ` AND e.starts_at <= $${idx}`; params.push(date_to); idx++; }

    const total = (await query(`SELECT COUNT(*) as c FROM events e JOIN venues v ON e.venue_id = v.id WHERE ${where}`, params)).rows[0].c;
    params.push(lmt, offset);
    const events = (await query(
      `SELECT e.*, v.id as v_id, v.name as v_name, v.description as v_desc, v.address as v_addr, v.lat as v_lat, v.lng as v_lng, v.cover_image_url as v_cover, v.created_at as v_created
       FROM events e JOIN venues v ON e.venue_id = v.id WHERE ${where} ORDER BY e.starts_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    )).rows;

    const result = events.map((e: any) => ({
      id: e.id, venue_id: e.venue_id, title: e.title, description: e.description,
      cover_image_url: e.cover_image_url, starts_at: e.starts_at, ends_at: e.ends_at,
      category: e.category, tags: e.tags, price_info: e.price_info, external_url: e.external_url, status: e.status, cancelled_at: e.cancelled_at, cancellation_reason: e.cancellation_reason, created_at: e.created_at,
      venue: { id: e.v_id, name: e.v_name, description: e.v_desc, address: e.v_addr, lat: e.v_lat, lng: e.v_lng, cover_image_url: e.v_cover, created_at: e.v_created },
      friends_interested: [], friends_plan_count: 0,
    }));

    return { events: result, total: parseInt(total) };
  });
}
