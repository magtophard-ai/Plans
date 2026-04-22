import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { pool, query } from '../db/pool.js';
import { insertNotification } from '../db/notifications.js';

function newShareToken(): string {
  return randomBytes(8).toString('hex');
}

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

    if (!title || !title.trim()) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'title required' });
    if (activity_type && !['cinema', 'coffee', 'bar', 'walk', 'dinner', 'sport', 'exhibition', 'other'].includes(activity_type)) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Invalid activity_type' });
    if (participant_ids && !Array.isArray(participant_ids)) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'participant_ids must be an array' });
    if (confirmed_place_lat != null && typeof confirmed_place_lat !== 'number') return reply.code(400).send({ code: 'INVALID_INPUT', message: 'confirmed_place_lat must be a number' });
    if (confirmed_place_lng != null && typeof confirmed_place_lng !== 'number') return reply.code(400).send({ code: 'INVALID_INPUT', message: 'confirmed_place_lng must be a number' });
    if (confirmed_time && isNaN(Date.parse(confirmed_time))) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'confirmed_time must be a valid date' });

    const others = (participant_ids || []).filter((id: string) => id !== userId);
    if (1 + others.length > 15) return reply.code(409).send({ code: 'PLAN_FULL', message: 'Max 15 participants including creator' });

    const place_status = confirmed_place_text ? 'confirmed' : 'undecided';
    const time_status = confirmed_time ? 'confirmed' : 'undecided';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const plan = (await client.query(
        `INSERT INTO plans (creator_id, title, activity_type, linked_event_id, place_status, time_status, confirmed_place_text, confirmed_place_lat, confirmed_place_lng, confirmed_time, pre_meet_enabled, pre_meet_place_text, pre_meet_time, share_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [userId, title, activity_type || 'other', linked_event_id || null, place_status, time_status, confirmed_place_text || null, confirmed_place_lat || null, confirmed_place_lng || null, confirmed_time || null, pre_meet_enabled || false, pre_meet_place_text || null, pre_meet_time || null, newShareToken()]
      )).rows[0];

      await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'going')", [plan.id, userId]);

      const inviterName = (await client.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;

      for (const pid of others) {
        await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'invited')", [plan.id, pid]);
        await client.query("INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status) VALUES ('plan', $1, $2, $3, 'pending')", [plan.id, userId, pid]);
        await insertNotification(pid, 'plan_invite', { plan_id: plan.id, inviter_name: inviterName }, (sql, p) => client.query(sql, p));
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

  // Public preview by share token — no auth, minimal payload.
  app.get('/by-token/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const plan = (await query('SELECT * FROM plans WHERE share_token = $1', [token])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    const creator = (await query('SELECT id, name, username, avatar_url FROM users WHERE id = $1', [plan.creator_id])).rows[0];
    const { rows: countRow } = await query('SELECT COUNT(*)::int AS c FROM plan_participants WHERE plan_id = $1', [plan.id]);
    return {
      plan: {
        id: plan.id,
        title: plan.title,
        activity_type: plan.activity_type,
        lifecycle_state: plan.lifecycle_state,
        confirmed_place_text: plan.confirmed_place_text,
        confirmed_time: plan.confirmed_time,
        share_token: plan.share_token,
        creator: creator || null,
        participant_count: countRow[0]?.c ?? 0,
        max_participants: 15,
      },
    };
  });

  // Join-by-link — authed. Adds caller as participant if plan is active + not full + caller not already in.
  app.post('/by-token/:token/join', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { token } = request.params as { token: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const plan = (await client.query('SELECT * FROM plans WHERE share_token = $1 FOR UPDATE', [token])).rows[0];
      if (!plan) { await client.query('ROLLBACK'); client.release(); return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' }); }
      if (plan.lifecycle_state !== 'active' && plan.lifecycle_state !== 'finalized') {
        await client.query('ROLLBACK'); client.release();
        return reply.code(400).send({ code: 'INVALID_STATE', message: 'Plan is not joinable' });
      }

      const existing = (await client.query('SELECT status FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [plan.id, userId])).rows[0];
      if (existing) {
        await client.query('COMMIT');
        client.release();
        return { already_joined: true, plan: await getPlanFull(plan.id) };
      }

      const count = parseInt((await client.query('SELECT COUNT(*) as c FROM plan_participants WHERE plan_id = $1', [plan.id])).rows[0].c);
      if (count >= 15) {
        await client.query('ROLLBACK'); client.release();
        return reply.code(409).send({ code: 'PLAN_FULL', message: 'Plan has max 15 participants' });
      }

      await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'going')", [plan.id, userId]);
      const joinerName = (await client.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;
      await insertNotification(plan.creator_id, 'plan_join_via_link', { plan_id: plan.id, joiner_id: userId, joiner_name: joinerName }, (sql, p) => client.query(sql, p));

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
    client.release();
    return { already_joined: false, plan: await getPlanFull((await query('SELECT id FROM plans WHERE share_token = $1', [token])).rows[0].id) };
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

  app.post('/:planId/participants', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { planId } = request.params as { planId: string };
    const { user_id: inviteeId } = request.body as { user_id: string };
    if (!inviteeId) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'user_id required' });

    const plan = (await query('SELECT * FROM plans WHERE id = $1 FOR UPDATE', [planId])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can invite' });
    if (plan.lifecycle_state !== 'active') return reply.code(400).send({ code: 'INVALID_STATE', message: 'Can only invite in active plans' });

    const existing = (await query('SELECT 1 FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [planId, inviteeId])).rows[0];
    if (existing) return reply.code(409).send({ code: 'ALREADY_PARTICIPANT', message: 'User is already a participant' });

    const count = (await query('SELECT COUNT(*) as c FROM plan_participants WHERE plan_id = $1', [planId])).rows[0].c;
    if (parseInt(count) >= 15) return reply.code(409).send({ code: 'PLAN_FULL', message: 'Plan has max 15 participants' });

    const inviterName = (await query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;
    await query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'invited')", [planId, inviteeId]);
    await query("INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status) VALUES ('plan', $1, $2, $3, 'pending')", [planId, userId, inviteeId]);
    await insertNotification(inviteeId, 'plan_invite', { plan_id: planId, inviter_name: inviterName });

    const r = (await query(
      `SELECT pp.*, u.id as u_id, u.phone as u_phone, u.name as u_name, u.username as u_username, u.avatar_url as u_avatar, u.created_at as u_created
       FROM plan_participants pp JOIN users u ON pp.user_id = u.id WHERE pp.plan_id = $1 AND pp.user_id = $2`,
      [planId, inviteeId]
    )).rows[0];
    return { participant: {
      id: r.id, plan_id: r.plan_id, user_id: r.user_id, status: r.status, joined_at: r.joined_at,
      user: { id: r.u_id, phone: r.u_phone, name: r.u_name, username: r.u_username, avatar_url: r.u_avatar, created_at: r.u_created },
    }};
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

  // ===================== SLICE 2 =====================

  // --- Proposals ---

  app.get('/:id/proposals', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type, status } = request.query as { type?: string; status?: string };
    const plan = (await query('SELECT id FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    let q = 'SELECT * FROM plan_proposals WHERE plan_id = $1';
    const params: any[] = [id];
    let idx = 2;
    if (type) { q += ` AND type = $${idx}`; params.push(type); idx++; }
    if (status) { q += ` AND status = $${idx}`; params.push(status); idx++; }
    q += ' ORDER BY created_at ASC';
    const proposals = (await query(q, params)).rows;
    for (const p of proposals) {
      p.votes = (await query('SELECT * FROM votes WHERE proposal_id = $1', [p.id])).rows;
    }
    return { proposals };
  });

  app.post('/:id/proposals', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { type, value_text, value_lat, value_lng, value_datetime } = body;
    if (!type || !value_text) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'type and value_text required' });
    if (!['place', 'time'].includes(type)) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'type must be place or time' });
    if (value_lat != null && typeof value_lat !== 'number') return reply.code(400).send({ code: 'INVALID_INPUT', message: 'value_lat must be a number' });
    if (value_lng != null && typeof value_lng !== 'number') return reply.code(400).send({ code: 'INVALID_INPUT', message: 'value_lng must be a number' });
    if (value_datetime && isNaN(Date.parse(value_datetime))) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'value_datetime must be a valid date' });

    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.lifecycle_state !== 'active') return reply.code(400).send({ code: 'INVALID_STATE', message: 'Cannot propose in non-active plan' });
    const isParticipant = (await query('SELECT 1 FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [id, userId])).rows[0];
    if (!isParticipant) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only participants can propose' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const proposal = (await client.query(
        `INSERT INTO plan_proposals (plan_id, proposer_id, type, value_text, value_lat, value_lng, value_datetime) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, userId, type, value_text, value_lat || null, value_lng || null, value_datetime || null]
      )).rows[0];

      // Update plan status to 'proposed' if currently 'undecided'
      if (type === 'place' && plan.place_status === 'undecided') {
        await client.query("UPDATE plans SET place_status = 'proposed', updated_at = now() WHERE id = $1", [id]);
      }
      if (type === 'time' && plan.time_status === 'undecided') {
        await client.query("UPDATE plans SET time_status = 'proposed', updated_at = now() WHERE id = $1", [id]);
      }

      // Create proposal_card message
      await client.query(
        `INSERT INTO messages (context_type, context_id, sender_id, text, type, reference_id) VALUES ('plan', $1, $2, '', 'proposal_card', $3)`,
        [id, userId, proposal.id]
      );

      // Notify other participants
      const proposerName = (await client.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;
      const participants = (await client.query('SELECT user_id FROM plan_participants WHERE plan_id = $1 AND user_id != $2', [id, userId])).rows;
      for (const p of participants) {
        await insertNotification(p.user_id, 'proposal_created', { plan_id: id, proposer_name: proposerName, proposal_type: type }, (sql, p2) => client.query(sql, p2));
      }

      await client.query('COMMIT');
      proposal.votes = [];
      (app as any).wsEmit(`plan:${id}`, 'plan.proposal.created', {
        id: proposal.id, plan_id: proposal.plan_id, proposer_id: proposal.proposer_id,
        type: proposal.type, value_text: proposal.value_text,
        value_lat: proposal.value_lat, value_lng: proposal.value_lng,
        value_datetime: proposal.value_datetime instanceof Date ? proposal.value_datetime.toISOString() : proposal.value_datetime,
        status: proposal.status, created_at: proposal.created_at instanceof Date ? proposal.created_at.toISOString() : proposal.created_at,
        votes: [],
      });
      return reply.code(201).send({ proposal });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // --- Votes ---

  app.post('/:id/proposals/:proposalId/vote', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id, proposalId } = request.params as { id: string; proposalId: string };

    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.lifecycle_state !== 'active') return reply.code(400).send({ code: 'INVALID_STATE', message: 'Cannot vote in non-active plan' });

    const proposal = (await query('SELECT * FROM plan_proposals WHERE id = $1 AND plan_id = $2', [proposalId, id])).rows[0];
    if (!proposal) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Proposal not found' });
    if (proposal.status !== 'active') return reply.code(400).send({ code: 'INVALID_STATE', message: 'Cannot vote on non-active proposal' });

    const isParticipant = (await query('SELECT 1 FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [id, userId])).rows[0];
    if (!isParticipant) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only participants can vote' });

    const alreadyVoted = (await query('SELECT 1 FROM votes WHERE proposal_id = $1 AND voter_id = $2', [proposalId, userId])).rows[0];
    if (alreadyVoted) return reply.code(409).send({ code: 'ALREADY_VOTED', message: 'Already voted on this proposal' });

    // Max 2 votes per type per plan
    const votesForType = (await query(
      `SELECT COUNT(*) as c FROM votes v JOIN plan_proposals pp ON v.proposal_id = pp.id WHERE pp.plan_id = $1 AND pp.type = $2 AND v.voter_id = $3 AND pp.status = 'active'`,
      [id, proposal.type, userId]
    )).rows[0].c;
    if (parseInt(votesForType) >= 2) return reply.code(409).send({ code: 'MAX_VOTES_EXCEEDED', message: 'Max 2 votes per proposal type' });

    const vote = (await query(
      'INSERT INTO votes (proposal_id, voter_id) VALUES ($1, $2) RETURNING *',
      [proposalId, userId]
    )).rows[0];
    (app as any).wsEmit(`plan:${id}`, 'plan.vote.changed', {
      proposal_id: proposalId, plan_id: id, voter_id: userId,
      action: 'added', vote_id: vote.id,
      created_at: vote.created_at instanceof Date ? vote.created_at.toISOString() : vote.created_at,
    });
    return { vote };
  });

  app.delete('/:id/proposals/:proposalId/vote', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id, proposalId } = request.params as { id: string; proposalId: string };

    const plan = (await query('SELECT id FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });

    const result = (await query('DELETE FROM votes WHERE proposal_id = $1 AND voter_id = $2', [proposalId, userId])).rowCount;
    if (!result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Vote not found' });
    (app as any).wsEmit(`plan:${id}`, 'plan.vote.changed', {
      proposal_id: proposalId, plan_id: id, voter_id: userId, action: 'removed',
    });
    return reply.code(204).send();
  });

  // --- Finalize / Unfinalize ---

  app.post('/:id/finalize', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const { place_proposal_id, time_proposal_id } = request.body as { place_proposal_id?: string; time_proposal_id?: string };

    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can finalize' });
    if (plan.lifecycle_state !== 'active') return reply.code(400).send({ code: 'INVALID_STATE', message: 'Can only finalize active plans' });

    // Finalize is allowed when:
    //   - a proposal id is provided (transition its status to confirmed as part of finalization), OR
    //   - place and time are both already confirmed directly on the plan (no proposal needed — just flip lifecycle_state).
    if (!place_proposal_id && !time_proposal_id && (plan.place_status !== 'confirmed' || plan.time_status !== 'confirmed')) {
      return reply.code(400).send({ code: 'INVALID_STATE', message: 'Plan must have confirmed place and time before finalizing' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sets: string[] = ["lifecycle_state = 'finalized'", 'updated_at = now()'];
      const params: any[] = [id];
      let idx = 2;

      if (place_proposal_id) {
        const prop = (await client.query('SELECT * FROM plan_proposals WHERE id = $1 AND plan_id = $2 AND type = $3', [place_proposal_id, id, 'place'])).rows[0];
        if (!prop) { await client.query('ROLLBACK'); return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Place proposal not found' }); }
        sets.push(`confirmed_place_text = $${idx}`); params.push(prop.value_text); idx++;
        sets.push(prop.value_lat != null ? `confirmed_place_lat = $${idx}` : 'confirmed_place_lat = NULL');
        if (prop.value_lat != null) { params.push(prop.value_lat); idx++; }
        sets.push(prop.value_lng != null ? `confirmed_place_lng = $${idx}` : 'confirmed_place_lng = NULL');
        if (prop.value_lng != null) { params.push(prop.value_lng); idx++; }
        sets.push("place_status = 'confirmed'");
        await client.query("UPDATE plan_proposals SET status = 'finalized' WHERE id = $1", [place_proposal_id]);
        await client.query("UPDATE plan_proposals SET status = 'superseded' WHERE plan_id = $1 AND type = 'place' AND id != $2 AND status = 'active'", [id, place_proposal_id]);
      }

      if (time_proposal_id) {
        const prop = (await client.query('SELECT * FROM plan_proposals WHERE id = $1 AND plan_id = $2 AND type = $3', [time_proposal_id, id, 'time'])).rows[0];
        if (!prop) { await client.query('ROLLBACK'); return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Time proposal not found' }); }
        const rawTime = prop.value_datetime || prop.value_text;
        let timeVal: string;
        if (rawTime instanceof Date) {
          timeVal = rawTime.toISOString();
        } else if (typeof rawTime === 'string') {
          const d = new Date(rawTime);
          timeVal = isNaN(d.getTime()) ? rawTime : d.toISOString();
        } else {
          timeVal = String(rawTime);
        }
        sets.push(`confirmed_time = $${idx}`); params.push(timeVal); idx++;
        sets.push("time_status = 'confirmed'");
        await client.query("UPDATE plan_proposals SET status = 'finalized' WHERE id = $1", [time_proposal_id]);
        await client.query("UPDATE plan_proposals SET status = 'superseded' WHERE plan_id = $1 AND type = 'time' AND id != $2 AND status = 'active'", [id, time_proposal_id]);
      }

      await client.query(`UPDATE plans SET ${sets.join(', ')} WHERE id = $1`, params);

      // Notify participants
      const participants = (await client.query('SELECT user_id FROM plan_participants WHERE plan_id = $1', [id])).rows;
      for (const p of participants) {
        await insertNotification(p.user_id, 'plan_finalized', { plan_id: id, plan_title: plan.title }, (sql, p2) => client.query(sql, p2));
      }

      // System message
      await client.query("INSERT INTO messages (context_type, context_id, sender_id, text, type) VALUES ('plan', $1, $2, 'План подтверждён', 'system')", [id, userId]);

      await client.query('COMMIT');
      const fullPlan = await getPlanFull(id);
      (app as any).wsEmit(`plan:${id}`, 'plan.finalized', {
        plan_id: id,
        place_proposal_id: place_proposal_id || null,
        time_proposal_id: time_proposal_id || null,
      });
      return { plan: fullPlan };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/:id/unfinalize', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };

    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can unfinalize' });
    if (plan.lifecycle_state !== 'finalized') return reply.code(400).send({ code: 'INVALID_STATE', message: 'Can only unfinalize finalized plans' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Revert finalized/superseded proposals back to active
      await client.query("UPDATE plan_proposals SET status = 'active' WHERE plan_id = $1 AND (status = 'finalized' OR status = 'superseded')", [id]);

      // Revert place/time status: if confirmed from proposals (not from creation), set to 'proposed'
      // If confirmed from creation (no proposals existed), keep 'confirmed'
      const hasPlaceProposals = (await client.query("SELECT 1 FROM plan_proposals WHERE plan_id = $1 AND type = 'place' LIMIT 1", [id])).rows[0];
      const hasTimeProposals = (await client.query("SELECT 1 FROM plan_proposals WHERE plan_id = $1 AND type = 'time' LIMIT 1", [id])).rows[0];

      const sets: string[] = ["lifecycle_state = 'active'", 'updated_at = now()'];
      if (hasPlaceProposals) sets.push("place_status = 'proposed'");
      if (hasTimeProposals) sets.push("time_status = 'proposed'");

      await client.query(`UPDATE plans SET ${sets.join(', ')} WHERE id = $1`, [id]);

      const participants = (await client.query('SELECT user_id FROM plan_participants WHERE plan_id = $1', [id])).rows;
      for (const p of participants) {
        await insertNotification(p.user_id, 'plan_unfinalized', { plan_id: id, plan_title: plan.title }, (sql, p2) => client.query(sql, p2));
      }

      await client.query("INSERT INTO messages (context_type, context_id, sender_id, text, type) VALUES ('plan', $1, $2, 'Подтверждение отменено', 'system')", [id, userId]);

      await client.query('COMMIT');
      (app as any).wsEmit(`plan:${id}`, 'plan.unfinalized', { plan_id: id });
      return { plan: await getPlanFull(id) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // --- Repeat ---

  app.post('/:id/repeat', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };

    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });
    if (plan.lifecycle_state !== 'completed') return reply.code(400).send({ code: 'INVALID_STATE', message: 'Can only repeat completed plans' });
    if (plan.creator_id !== userId) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only creator can repeat' });

    const oldParticipants = (await query('SELECT user_id FROM plan_participants WHERE plan_id = $1', [id])).rows;
    const others = oldParticipants.filter((p: any) => p.user_id !== userId).map((p: any) => p.user_id);
    if (1 + others.length > 15) return reply.code(409).send({ code: 'PLAN_FULL', message: 'Max 15 participants' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newPlan = (await client.query(
        `INSERT INTO plans (creator_id, title, activity_type, place_status, time_status, pre_meet_enabled, share_token) VALUES ($1, $2, $3, 'undecided', 'undecided', $4, $5) RETURNING *`,
        [userId, plan.title, plan.activity_type, false, newShareToken()]
      )).rows[0];

      await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'going')", [newPlan.id, userId]);

      const inviterName = (await client.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0]?.name;
      for (const pid of others) {
        await client.query("INSERT INTO plan_participants (plan_id, user_id, status) VALUES ($1, $2, 'invited')", [newPlan.id, pid]);
        await client.query("INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status) VALUES ('plan', $1, $2, $3, 'pending')", [newPlan.id, userId, pid]);
        await insertNotification(pid, 'plan_invite', { plan_id: newPlan.id, inviter_name: inviterName }, (sql, p) => client.query(sql, p));
      }

      await client.query('COMMIT');
      return reply.code(201).send({ plan: await getPlanFull(newPlan.id) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // --- Messages ---

  app.get('/:id/messages', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { before, limit = '50' } = request.query as { before?: string; limit?: string };
    const lmt = Math.min(parseInt(limit), 100);

    const plan = (await query('SELECT id FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });

    let q = `SELECT m.*, u.id as u_id, u.phone as u_phone, u.name as u_name, u.username as u_username, u.avatar_url as u_avatar, u.created_at as u_created
             FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.context_id = $1`;
    const params: any[] = [id];
    let idx = 2;
    if (before) {
      q += ` AND m.created_at < $${idx}`;
      params.push(before);
      idx++;
    }
    q += ` ORDER BY m.created_at DESC LIMIT $${idx}`;
    params.push(lmt);

    const rows = (await query(q, params)).rows;
    const messages = rows.map((r: any) => ({
      id: r.id, context_type: r.context_type, context_id: r.context_id,
      sender_id: r.sender_id, text: r.text, type: r.type,
      reference_id: r.reference_id, client_message_id: r.client_message_id || null,
      created_at: r.created_at,
      sender: { id: r.u_id, phone: r.u_phone, name: r.u_name, username: r.u_username, avatar_url: r.u_avatar, created_at: r.u_created },
    }));
    return { messages: messages.reverse() };
  });

  app.post('/:id/messages', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params as { id: string };
    const { text, client_message_id } = request.body as { text: string; client_message_id?: string };
    if (!text || !text.trim()) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'text required' });
    if (text.length > 2000) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'text too long (max 2000)' });

    const plan = (await query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
    if (!plan) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Plan not found' });

    const isParticipant = (await query('SELECT 1 FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [id, userId])).rows[0];
    if (!isParticipant) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Only participants can send messages' });

    const msg = (await query(
      `INSERT INTO messages (context_type, context_id, sender_id, text, type, client_message_id) VALUES ('plan', $1, $2, $3, 'user', $4) RETURNING *`,
      [id, userId, text.trim(), client_message_id || null]
    )).rows[0];
    const sender = (await query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    const messageResponse = {
      id: msg.id, context_type: msg.context_type, context_id: msg.context_id,
      sender_id: msg.sender_id, text: msg.text, type: msg.type,
      reference_id: msg.reference_id, client_message_id: msg.client_message_id || null,
      created_at: msg.created_at instanceof Date ? msg.created_at.toISOString() : msg.created_at,
      sender: { id: sender.id, phone: sender.phone, name: sender.name, username: sender.username, avatar_url: sender.avatar_url, created_at: sender.created_at instanceof Date ? sender.created_at.toISOString() : sender.created_at },
    };

    (app as any).wsEmit(`plan:${id}`, 'plan.message.created', messageResponse);

    return reply.code(201).send({ message: messageResponse });
  });
}
