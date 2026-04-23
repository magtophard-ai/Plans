import type { FastifyInstance } from 'fastify';
import { sendOtp, verifyOtp, type VerifyOtpResult } from '../auth/otp.js';
import { query } from '../db/pool.js';

function normalizeRuPhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return null;

  let normalized = digits;
  if (normalized.length === 10) normalized = `7${normalized}`;
  if (normalized.length === 11 && normalized[0] === '8') normalized = `7${normalized.slice(1)}`;
  if (normalized.length !== 11 || normalized[0] !== '7') return null;

  return `+${normalized}`;
}

export async function authRoutes(app: FastifyInstance) {
  const rateLimit = (app as any).rateLimit as undefined | ((opts: { max: number; timeWindow: string | number }) => any);
  const sendConfig = rateLimit
    ? { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }
    : {};
  const verifyConfig = rateLimit
    ? { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }
    : {};

  app.post('/otp/send', sendConfig, async (request, reply) => {
    const { phone } = request.body as { phone: string };
    const normalizedPhone = normalizeRuPhone(phone);
    if (!normalizedPhone) return reply.code(400).send({ code: 'INVALID_PHONE', message: 'Invalid phone number' });
    sendOtp(normalizedPhone);
    return reply.send({});
  });

  app.post('/otp/verify', verifyConfig, async (request, reply) => {
    const { phone, code } = request.body as { phone: string; code: string };
    const normalizedPhone = normalizeRuPhone(phone);
    if (!normalizedPhone || !code) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'phone and code required' });
    const result: VerifyOtpResult = verifyOtp(normalizedPhone, code);
    if (result === 'locked') {
      return reply.code(429).send({ code: 'OTP_LOCKED', message: 'Too many invalid attempts, request a new code' });
    }
    if (result !== 'ok') {
      return reply.code(401).send({ code: 'INVALID_OTP', message: 'Invalid or expired OTP' });
    }

    let user = (await query('SELECT * FROM users WHERE phone = $1', [normalizedPhone])).rows[0];
    if (!user) {
      const username = 'user_' + normalizedPhone.slice(-4);
      const name = 'Пользователь';
      user = (await query(
        'INSERT INTO users (phone, name, username) VALUES ($1, $2, $3) RETURNING *',
        [normalizedPhone, name, username]
      )).rows[0];
    }

    const accessToken = app.jwt.sign({ userId: user.id }, { expiresIn: '1h' });
    const refreshToken = app.jwt.sign({ userId: user.id, type: 'refresh' }, { expiresIn: '30d' });
    return reply.send({ access_token: accessToken, refresh_token: refreshToken, user });
  });

  app.post('/refresh', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token: string };
    if (!refresh_token) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'refresh_token required' });
    try {
      const decoded = app.jwt.verify(refresh_token) as any;
      if (decoded.type !== 'refresh') return reply.code(401).send({ code: 'INVALID_TOKEN', message: 'Not a refresh token' });
      const accessToken = app.jwt.sign({ userId: decoded.userId }, { expiresIn: '1h' });
      const newRefresh = app.jwt.sign({ userId: decoded.userId, type: 'refresh' }, { expiresIn: '30d' });
      return reply.send({ access_token: accessToken, refresh_token: newRefresh });
    } catch {
      return reply.code(401).send({ code: 'INVALID_TOKEN', message: 'Invalid refresh token' });
    }
  });

  app.get('/me', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const user = (await query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND', message: 'User not found' });
    return { user };
  });
}
