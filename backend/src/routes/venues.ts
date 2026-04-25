import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';

export async function venueRoutes(app: FastifyInstance) {
  app.get('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const venue = (await query('SELECT * FROM venues WHERE id = $1', [id])).rows[0];
    if (!venue) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Venue not found' });
    return { venue };
  });

  app.get('/:id/events', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const { page = '1', limit = '20' } = request.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lmt = Math.min(parseInt(limit), 100);
    const total = (await query("SELECT COUNT(*) as c FROM events WHERE venue_id = $1 AND status = 'published'", [id])).rows[0].c;
    const events = (await query(
      "SELECT * FROM events WHERE venue_id = $1 AND status = 'published' ORDER BY starts_at DESC LIMIT $2 OFFSET $3",
      [id, lmt, offset]
    )).rows;
    return { events, total: parseInt(total) };
  });
}
