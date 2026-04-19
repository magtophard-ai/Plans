import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool.js';

export async function invitationRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const { status } = request.query as { status?: string };
    const filter = status ? 'AND i.status = $2' : '';
    const params: any[] = [userId];
    if (status) params.push(status);

    const rows = (await query(
      `SELECT i.* FROM invitations i WHERE i.invitee_id = $1 ${filter} ORDER BY i.created_at DESC`,
      params
    )).rows;

    const invitations = [];
    for (const inv of rows) {
      let plan = null, group = null;
      if (inv.type === 'plan') {
        const r = (await query('SELECT id, title, activity_type, lifecycle_state, creator_id, created_at FROM plans WHERE id = $1', [inv.target_id])).rows[0];
        if (r) plan = r;
      } else if (inv.type === 'group') {
        const r = (await query('SELECT id, name, creator_id, avatar_url, created_at FROM groups WHERE id = $1', [inv.target_id])).rows[0];
        if (r) group = r;
      }
      invitations.push({ ...inv, plan, group });
    }
    return { invitations };
  });

  app.patch('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    if (!['accepted', 'declined'].includes(status)) return reply.code(400).send({ code: 'INVALID_STATUS', message: 'Must be accepted or declined' });

    const inv = (await query('SELECT * FROM invitations WHERE id = $1', [id])).rows[0];
    if (!inv) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Invitation not found' });
    if (inv.invitee_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Not your invitation' });
    if (inv.status !== 'pending') return reply.code(400).send({ code: 'ALREADY_RESPONDED', message: 'Invitation already responded to' });

    if (status === 'declined') {
      await query("UPDATE invitations SET status = 'declined' WHERE id = $1", [id]);
      const updated = (await query('SELECT * FROM invitations WHERE id = $1', [id])).rows[0];
      return { invitation: { ...updated, plan: null, group: null } };
    }

    // accepted — use transaction for atomicity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // lock the plan row to prevent concurrent accepts exceeding 15
      if (inv.type === 'plan') {
        const plan = (await client.query('SELECT id FROM plans WHERE id = $1 FOR UPDATE', [inv.target_id])).rows[0];
        if (!plan) { await client.query('ROLLBACK'); client.release(); return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' }); }

        const existing = (await client.query('SELECT 1 FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [inv.target_id, userId])).rows[0];
        if (existing) {
          await client.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [id]);
          await client.query('COMMIT');
          client.release();
          const updated = (await query('SELECT * FROM invitations WHERE id = $1', [id])).rows[0];
          let planStub = (await query('SELECT id, title, activity_type, lifecycle_state, creator_id, created_at FROM plans WHERE id = $1', [inv.target_id])).rows[0] || null;
          return { invitation: { ...updated, plan: planStub, group: null } };
        }

        const count = (await client.query('SELECT COUNT(*) as c FROM plan_participants WHERE plan_id = $1', [inv.target_id])).rows[0].c;
        if (parseInt(count) >= 15) {
          await client.query('ROLLBACK');
          client.release();
          return reply.code(409).send({ code: 'PLAN_FULL', message: 'Plan has max 15 participants' });
        }

        await client.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [id]);
        await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'going')", [inv.target_id, userId]);
      } else if (inv.type === 'group') {
        await client.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [id]);
        await client.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING", [inv.target_id, userId]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
    client.release();

    const updated = (await query('SELECT * FROM invitations WHERE id = $1', [id])).rows[0];
    let plan = null, group = null;
    if (updated.type === 'plan') plan = (await query('SELECT id, title, activity_type, lifecycle_state, creator_id, created_at FROM plans WHERE id = $1', [updated.target_id])).rows[0] || null;
    if (updated.type === 'group') group = (await query('SELECT id, name, creator_id, avatar_url, created_at FROM groups WHERE id = $1', [updated.target_id])).rows[0] || null;
    return { invitation: { ...updated, plan, group } };
  });
}
