import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool.js';

export async function groupRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const rows = (await query(
      `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM groups g WHERE g.creator_id = $1 OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1)
       ORDER BY g.created_at DESC`,
      [userId]
    )).rows;
    const groups = rows.map((r: any) => ({
      id: r.id, creator_id: r.creator_id, name: r.name, avatar_url: r.avatar_url, created_at: r.created_at, member_count: parseInt(r.member_count),
    }));
    return { groups };
  });

  app.post('/', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { name, member_ids } = request.body as { name: string; member_ids: string[] };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const group = (await client.query('INSERT INTO groups (creator_id, name) VALUES ($1, $2) RETURNING *', [userId, name])).rows[0];
      await client.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')", [group.id, userId]);

      const inviterName = (await client.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;
      for (const mid of (member_ids || [])) {
        if (mid !== userId) {
          await client.query("INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status) VALUES ('group', $1, $2, $3, 'pending')", [group.id, userId, mid]);
          await client.query("INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'group_invite', $2)", [mid, JSON.stringify({ group_id: group.id, inviter_name: inviterName })]);
        }
      }

      await client.query('COMMIT');

      const members = (await query(
        `SELECT gm.*, u.id as u_id, u.phone as u_phone, u.name as u_name, u.username as u_username, u.avatar_url as u_avatar, u.created_at as u_created
         FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = $1`,
        [group.id]
      )).rows.map((r: any) => ({
        id: r.id, group_id: r.group_id, user_id: r.user_id, role: r.role, joined_at: r.joined_at,
        user: { id: r.u_id, phone: r.u_phone, name: r.u_name, username: r.u_username, avatar_url: r.u_avatar, created_at: r.u_created },
      }));

      return reply.code(201).send({ group: { ...group, members } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const group = (await query('SELECT * FROM groups WHERE id = $1', [id])).rows[0];
    if (!group) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Group not found' });

    const members = (await query(
      `SELECT gm.*, u.id as u_id, u.phone as u_phone, u.name as u_name, u.username as u_username, u.avatar_url as u_avatar, u.created_at as u_created
       FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = $1`,
      [id]
    )).rows.map((r: any) => ({
      id: r.id, group_id: r.group_id, user_id: r.user_id, role: r.role, joined_at: r.joined_at,
      user: { id: r.u_id, phone: r.u_phone, name: r.u_name, username: r.u_username, avatar_url: r.u_avatar, created_at: r.u_created },
    }));
    return { group: { ...group, members } };
  });

  app.post('/:id/members', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const { user_id } = request.body as { user_id: string };
    const group = (await query('SELECT * FROM groups WHERE id = $1', [id])).rows[0];
    if (!group) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Group not found' });
    if (group.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can add members' });

    // Only create invitation — member is added when invitation is accepted
    await query("INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status) VALUES ('group', $1, $2, $3, 'pending')", [id, userId, user_id]);
    const inviterName = (await query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;
    await query("INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'group_invite', $2)", [user_id, JSON.stringify({ group_id: id, inviter_name: inviterName })]);

    return reply.code(201).send({ invitation_id: null, message: 'Invitation sent' });
  });

  app.delete('/:id/members/:uid', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id, uid } = request.params as { id: string; uid: string };
    const group = (await query('SELECT * FROM groups WHERE id = $1', [id])).rows[0];
    if (!group) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Group not found' });
    if (uid !== userId && group.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Cannot remove this member' });
    await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [id, uid]);
    return reply.code(204).send();
  });
}
