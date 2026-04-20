import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const user = (await query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    return { user };
  });

  app.patch('/me', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { name, username, avatar_url } = request.body as any;
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 100))
      return reply.code(400).send({ code: 'INVALID_INPUT', message: 'name must be 1-100 chars' });
    if (username !== undefined) {
      if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{1,50}$/.test(username))
        return reply.code(400).send({ code: 'INVALID_INPUT', message: 'username must be 1-50 alphanumeric/underscore chars' });
      if (username !== (await query('SELECT username FROM users WHERE id = $1', [userId])).rows[0]?.username) {
        const taken = (await query('SELECT 1 FROM users WHERE username = $1 AND id != $2', [username, userId])).rows[0];
        if (taken) return reply.code(409).send({ code: 'USERNAME_TAKEN', message: 'Username already taken' });
      }
    }
    if (avatar_url !== undefined && avatar_url !== null && (typeof avatar_url !== 'string' || avatar_url.length > 500))
      return reply.code(400).send({ code: 'INVALID_INPUT', message: 'avatar_url must be null or string <= 500 chars' });
    const sets: string[] = [];
    const vals: any[] = [userId];
    let idx = 2;
    if (name !== undefined) { sets.push(`name = $${idx}`); vals.push(name); idx++; }
    if (username !== undefined) { sets.push(`username = $${idx}`); vals.push(username); idx++; }
    if (avatar_url !== undefined) { sets.push(`avatar_url = $${idx}`); vals.push(avatar_url); idx++; }
    if (sets.length === 0) return { user: (await query('SELECT * FROM users WHERE id = $1', [userId])).rows[0] };
    const user = (await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals)).rows[0];
    return { user };
  });

  app.get('/friends', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const { status } = request.query as { status?: string };
    const filter = status === 'accepted' ? "AND f.status = 'accepted'" : '';
    const rows = (await query(
      `SELECT u.* FROM users u JOIN friendships f ON (
        (f.requester_id = $1 AND f.addressee_id = u.id) OR
        (f.addressee_id = $1 AND f.requester_id = u.id)
      ) ${filter}`,
      [userId]
    )).rows;
    return { friends: rows };
  });

  app.get('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (await query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND', message: 'User not found' });
    return { user };
  });

  app.post('/friends/:id', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const { id: friendId } = request.params as { id: string };
    const [r, a] = userId < friendId ? [userId, friendId] : [friendId, userId];
    const friendship = (await query(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')
       ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status = 'accepted'
       RETURNING *`,
      [r, a]
    )).rows[0];
    return { friendship };
  });

  app.delete('/friends/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id: friendId } = request.params as { id: string };
    const [r, a] = userId < friendId ? [userId, friendId] : [friendId, userId];
    await query('DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2', [r, a]);
    return reply.code(204).send();
  });
}
