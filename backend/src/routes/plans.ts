import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool.js';

async function getPlanFull(planId: string) {
  const plan = (await query('SELECT * FROM plans WHERE id = $1', [planId])).rows[0];
  if (!plan) return null;
  const participants = (await query(
    `SELECT pp.*, u.id as u_id, u.phone as u_phone, u.name as u_name, u.username as u_username, u.avatar_url as u_avatar, u.created_at as u_created
     FROM plan_participants pp JOIN users u ON pp.user_id = u.id WHERE pp.plan_id = $1`,
    [planId]
  )).rows.map((r: any) => ({
    id: r.id, plan_id: r.plan_id, user_id: r.user_id, status: r.status, joined_at: r.joined_at,
    user: { id: r.u_id, phone: r.u_phone, name: r.u_name, username: r.u_username, avatar_url: r.u_avatar, created_at: r.u_created },
  }));

  const proposals = (await query('SELECT * FROM plan_proposals WHERE plan_id = $1', [planId])).rows;
  for (const p of proposals) {
    p.votes = (await query('SELECT * FROM votes WHERE proposal_id = $1', [p.id])).rows;
  }

  let linked_event = null;
  if (plan.linked_event_id) {
    const e = (await query(
      `SELECT e.*, v.id as v_id, v.name as v_name, v.description as v_desc, v.address as v_addr, v.lat as v_lat, v.lng as v_lng, v.cover_image_url as v_cover, v.created_at as v_created
       FROM events e JOIN venues v ON e.venue_id = v.id WHERE e.id = $1`,
      [plan.linked_event_id]
    )).rows[0];
    if (e) linked_event = {
      id: e.id, venue_id: e.venue_id, title: e.title, description: e.description,
      cover_image_url: e.cover_image_url, starts_at: e.starts_at, ends_at: e.ends_at,
      category: e.category, tags: e.tags, price_info: e.price_info, external_url: e.external_url, created_at: e.created_at,
      venue: { id: e.v_id, name: e.v_name, description: e.v_desc, address: e.v_addr, lat: e.v_lat, lng: e.v_lng, cover_image_url: e.v_cover, created_at: e.v_created },
      friends_interested: [], friends_plan_count: 0,
    };
  }

  return { ...plan, participants, proposals, linked_event };
}

export async function planRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const userId = (request.user as any).userId;
    const { lifecycle, participant, page = '1', limit = '20' } = request.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lmt = Math.min(parseInt(limit), 100);

    let where = '1=1';
    const params: any[] = [];
    let idx = 1;

    if (lifecycle) {
      const lifecycles = lifecycle.split('|');
      where += ` AND p.lifecycle_state = ANY($${idx})`;
      params.push(lifecycles);
      idx++;
    }
    if (participant === 'me') {
      where += ` AND EXISTS (SELECT 1 FROM plan_participants pp WHERE pp.plan_id = p.id AND pp.user_id = $${idx})`;
      params.push(userId);
      idx++;
    }

    const total = (await query(`SELECT COUNT(*) as c FROM plans p WHERE ${where}`, params)).rows[0].c;
    params.push(lmt, offset);
    const plans = (await query(
      `SELECT p.* FROM plans p WHERE ${where} ORDER BY p.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    )).rows;

    const result = [];
    for (const p of plans) {
      result.push(await getPlanFull(p.id));
    }
    return { plans: result, total: parseInt(total) };
  });

  app.post('/', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const body = request.body as any;
    const { title, activity_type, linked_event_id, confirmed_place_text, confirmed_place_lat, confirmed_place_lng, confirmed_time, pre_meet_enabled, pre_meet_place_text, pre_meet_time, participant_ids } = body;

    const others = (participant_ids || []).filter((id: string) => id !== userId);
    if (1 + others.length > 15) return reply.code(409).send({ code: 'PLAN_FULL', message: 'Max 15 participants including creator' });

    const place_status = confirmed_place_text ? 'confirmed' : 'undecided';
    const time_status = confirmed_time ? 'confirmed' : 'undecided';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const plan = (await client.query(
        `INSERT INTO plans (creator_id, title, activity_type, linked_event_id, place_status, time_status, confirmed_place_text, confirmed_place_lat, confirmed_place_lng, confirmed_time, pre_meet_enabled, pre_meet_place_text, pre_meet_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [userId, title, activity_type || 'other', linked_event_id || null, place_status, time_status, confirmed_place_text || null, confirmed_place_lat || null, confirmed_place_lng || null, confirmed_time || null, pre_meet_enabled || false, pre_meet_place_text || null, pre_meet_time || null]
      )).rows[0];

      await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'going')", [plan.id, userId]);

      const inviterName = (await client.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;

      for (const pid of others) {
        await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'invited')", [plan.id, pid]);
        await client.query("INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status) VALUES ('plan', $1, $2, $3, 'pending')", [plan.id, userId, pid]);
        await client.query("INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'plan_invite', $2)", [pid, JSON.stringify({ plan_id: plan.id, inviter_name: inviterName })]);
      }

      await client.query('COMMIT');
      return reply.code(201).send({ plan: await getPlanFull(plan.id) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const plan = await getPlanFull(id);
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    return { plan };
  });

  app.patch('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can edit' });

    const { pre_meet_enabled, pre_meet_place_text, pre_meet_time } = request.body as any;
    const sets: string[] = ['updated_at = now()'];
    const vals: any[] = [id];
    let idx = 2;
    if (pre_meet_enabled !== undefined) { sets.push(`pre_meet_enabled = $${idx}`); vals.push(pre_meet_enabled); idx++; }
    if (pre_meet_place_text !== undefined) { sets.push(`pre_meet_place_text = $${idx}`); vals.push(pre_meet_place_text); idx++; }
    if (pre_meet_time !== undefined) { sets.push(`pre_meet_time = $${idx}`); vals.push(pre_meet_time); idx++; }
    await query(`UPDATE plans SET ${sets.join(', ')} WHERE id = $1`, vals);
    return { plan: await getPlanFull(id) };
  });

  app.post('/:id/cancel', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can cancel' });
    if (!['active', 'finalized'].includes(plan.lifecycle_state)) return reply.code(400).send({ code: 'INVALID_STATE', message: 'Can only cancel active or finalized plans' });
    await query("UPDATE plans SET lifecycle_state = 'cancelled', updated_at = now() WHERE id = $1", [id]);
    return { plan: await getPlanFull(id) };
  });

  app.post('/:id/complete', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can complete' });
    if (!['finalized', 'active'].includes(plan.lifecycle_state)) return reply.code(400).send({ code: 'INVALID_STATE', message: 'Can only complete finalized or active plans' });
    await query("UPDATE plans SET lifecycle_state = 'completed', updated_at = now() WHERE id = $1", [id]);
    return { plan: await getPlanFull(id) };
  });

  app.get('/:planId/participants', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { planId } = request.params as { planId: string };
    const rows = (await query(
      `SELECT pp.*, u.id as u_id, u.phone as u_phone, u.name as u_name, u.username as u_username, u.avatar_url as u_avatar, u.created_at as u_created
       FROM plan_participants pp JOIN users u ON pp.user_id = u.id WHERE pp.plan_id = $1`,
      [planId]
    )).rows;
    const participants = rows.map((r: any) => ({
      id: r.id, plan_id: r.plan_id, user_id: r.user_id, status: r.status, joined_at: r.joined_at,
      user: { id: r.u_id, phone: r.u_phone, name: r.u_name, username: r.u_username, avatar_url: r.u_avatar, created_at: r.u_created },
    }));
    return { participants };
  });

  app.patch('/:planId/participants/:uid', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { planId, uid } = request.params as { planId: string; uid: string };
    const { status } = request.body as { status: string };
    const plan = (await query('SELECT * FROM plans WHERE id = $1', [planId])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (uid !== userId && plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Cannot update this participant' });
    if (!['going', 'thinking', 'cant'].includes(status)) return reply.code(400).send({ code: 'INVALID_STATUS', message: 'Invalid status' });
    await query('UPDATE plan_participants SET status = $1 WHERE plan_id = $2 AND user_id = $3', [status, planId, uid]);
    const r = (await query(
      `SELECT pp.*, u.id as u_id, u.phone as u_phone, u.name as u_name, u.username as u_username, u.avatar_url as u_avatar, u.created_at as u_created
       FROM plan_participants pp JOIN users u ON pp.user_id = u.id WHERE pp.plan_id = $1 AND pp.user_id = $2`,
      [planId, uid]
    )).rows[0];
    return { participant: {
      id: r.id, plan_id: r.plan_id, user_id: r.user_id, status: r.status, joined_at: r.joined_at,
      user: { id: r.u_id, phone: r.u_phone, name: r.u_name, username: r.u_username, avatar_url: r.u_avatar, created_at: r.u_created },
    }};
  });

  app.delete('/:planId/participants/:uid', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { planId, uid } = request.params as { planId: string; uid: string };
    const plan = (await query('SELECT * FROM plans WHERE id = $1', [planId])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (uid !== userId && plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Cannot remove this participant' });
    await query('DELETE FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [planId, uid]);
    return reply.code(204).send();
  });
}
