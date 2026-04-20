import { query, pool } from './pool.js';

let _emit: ((channel: string, event: string, payload: object) => void) | null = null;

export function setEmitter(emit: (channel: string, event: string, payload: object) => void) {
  _emit = emit;
}

type QueryFn = { (sql: string, params?: any[]): Promise<{ rows: any[] }> };

export async function insertNotification(userId: string, type: string, payload: Record<string, unknown>, q?: QueryFn) {
  const run = q || query;
  const row = (await run(
    "INSERT INTO notifications (user_id, type, payload) VALUES ($1, $2, $3) RETURNING id, created_at",
    [userId, type, JSON.stringify(payload)]
  )).rows[0];
  if (_emit) {
    _emit(`user:${userId}`, 'notification.created', {
      notificationId: row.id,
      type,
      payload,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    });
  }
}
