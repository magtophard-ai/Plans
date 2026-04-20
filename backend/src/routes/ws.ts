import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';

interface ClientConn {
  userId: string;
  socket: import('ws').WebSocket;
  channels: Set<string>;
  pingInterval: ReturnType<typeof setInterval>;
  lastPong: number;
  pingOutstanding: boolean;
}

const connections = new Map<number, ClientConn>();
let connIdSeq = 0;

function emit(channel: string, event: string, payload: object) {
  const msg = JSON.stringify({ type: 'event', channel, event, payload });
  for (const conn of connections.values()) {
    if (conn.channels.has(channel)) {
      try { conn.socket.send(msg); } catch {}
    }
  }
}

async function canSubscribePlan(userId: string, planId: string): Promise<boolean> {
  const row = (await query('SELECT 1 FROM plan_participants WHERE plan_id = $1 AND user_id = $2', [planId, userId])).rows[0];
  return !!row;
}

export async function wsRoutes(app: FastifyInstance) {
  await app.register(import('@fastify/websocket'));

  app.get('/ws', { websocket: true }, (socket) => {
    const connId = ++connIdSeq;
    let authenticated = false;
    let userId = '';

    const send = (data: object) => {
      try { socket.send(JSON.stringify(data)); } catch {}
    };

    socket.on('message', async (raw: Buffer) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'auth') {
        try {
          const decoded = app.jwt.verify(msg.token) as any;
          userId = decoded.userId;
          authenticated = true;
          const conn: ClientConn = { userId, socket, channels: new Set([`user:${userId}`]), pingInterval: null as any, lastPong: Date.now(), pingOutstanding: false };
          conn.pingInterval = setInterval(() => {
            if (conn.pingOutstanding && Date.now() - conn.lastPong > 10000) {
              clearInterval(conn.pingInterval);
              try { socket.close(); } catch {}
              return;
            }
            conn.pingOutstanding = true;
            send({ type: 'ping' });
          }, 30000);
          connections.set(connId, conn);
          send({ type: 'auth_ok', userId });
        } catch {
          send({ type: 'auth_error', message: 'Invalid token' });
          socket.close();
        }
        return;
      }

      if (msg.type === 'pong') {
        const conn = connections.get(connId);
        if (conn) {
          conn.lastPong = Date.now();
          conn.pingOutstanding = false;
        }
        return;
      }

      if (!authenticated) {
        send({ type: 'error', message: 'Not authenticated' });
        return;
      }

      if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
        const ch = msg.channel;
        if (ch.startsWith('plan:')) {
          const planId = ch.slice(5);
          const allowed = await canSubscribePlan(userId, planId);
          if (!allowed) {
            send({ type: 'error', message: 'Not a participant of this plan' });
            return;
          }
        } else if (ch !== `user:${userId}`) {
          send({ type: 'error', message: 'Cannot subscribe to this channel' });
          return;
        }
        const conn = connections.get(connId);
        if (conn) {
          conn.channels.add(ch);
          send({ type: 'subscribed', channel: ch });
        }
        return;
      }

      if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
        const conn = connections.get(connId);
        if (conn) {
          conn.channels.delete(msg.channel);
          send({ type: 'unsubscribed', channel: msg.channel });
        }
        return;
      }

      send({ type: 'error', message: 'Unknown message type' });
    });

    socket.on('close', () => {
      const c = connections.get(connId);
      if (c) clearInterval(c.pingInterval);
      connections.delete(connId);
    });

    socket.on('error', () => {
      const c = connections.get(connId);
      if (c) clearInterval(c.pingInterval);
      connections.delete(connId);
    });
  });
}

export { emit };
