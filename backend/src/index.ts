import 'dotenv/config';
import { initSentry, captureError, flushSentry } from './observability/sentry.js';
import { initAnalytics, shutdownAnalytics } from './observability/analytics.js';

initSentry();
initAnalytics();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { pool } from './db/pool.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { eventRoutes } from './routes/events.js';
import { venueRoutes } from './routes/venues.js';
import { planRoutes } from './routes/plans.js';
import { invitationRoutes } from './routes/invitations.js';
import { groupRoutes } from './routes/groups.js';
import { notificationRoutes } from './routes/notifications.js';
import { searchRoutes } from './routes/search.js';
import { wsRoutes, emit as wsEmit } from './routes/ws.js';
import { setEmitter } from './db/notifications.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// Reject unsafe JWT_SECRET outside of dev — prevents a silent prod deploy
// signing tokens with the well-known 'dev-secret' default.
const UNSAFE_SECRETS = new Set(['dev-secret', 'dev-secret-change-in-prod', 'secret', 'changeme', '']);
const rawJwtSecret = process.env.JWT_SECRET;
if (IS_PROD) {
  if (!rawJwtSecret || UNSAFE_SECRETS.has(rawJwtSecret) || rawJwtSecret.length < 32) {
    // eslint-disable-next-line no-console
    console.error('[fatal] JWT_SECRET must be set to a strong value (>=32 chars) in production');
    process.exit(1);
  }
}
const JWT_SECRET = rawJwtSecret || 'dev-secret';

// CORS: strict whitelist in prod via CORS_ORIGIN (comma-separated). In dev,
// reflect the request origin so Expo web / LAN URLs "just work".
const corsOriginEnv = process.env.CORS_ORIGIN?.trim();
const corsOrigin: boolean | string[] = corsOriginEnv
  ? corsOriginEnv.split(',').map((s) => s.trim()).filter(Boolean)
  : !IS_PROD;

const app = Fastify({ logger: true });

await app.register(helmet, {
  // Disabled because the API is JSON-only + we don't serve HTML from here,
  // and the default CSP blocks the Swagger-style tools some devs use.
  contentSecurityPolicy: false,
});

await app.register(rateLimit, {
  global: false,
  max: 300,
  timeWindow: '1 minute',
});

await app.register(cors, {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});
await app.register(jwt, { secret: JWT_SECRET });

app.decorate('authenticate', async (request: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    throw { statusCode: 401, message: 'Unauthorized' };
  }
});

app.decorate('pg', pool);
app.decorate('wsEmit', wsEmit);
setEmitter(wsEmit);

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(eventRoutes, { prefix: '/api/events' });
await app.register(venueRoutes, { prefix: '/api/venues' });
await app.register(planRoutes, { prefix: '/api/plans' });
await app.register(invitationRoutes, { prefix: '/api/invitations' });
await app.register(groupRoutes, { prefix: '/api/groups' });
await app.register(notificationRoutes, { prefix: '/api/notifications' });
await app.register(searchRoutes, { prefix: '/api/search' });
await app.register(wsRoutes, { prefix: '/api' });

app.get('/api/health', async () => ({ status: 'ok' }));

app.setErrorHandler((error: any, request: any, reply: any) => {
  if (error.statusCode === 401) {
    return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
  }
  if (error.statusCode === 429) {
    return reply.code(429).send({ code: 'RATE_LIMITED', message: 'Too many requests, slow down' });
  }
  if (error.statusCode) {
    return reply.code(error.statusCode).send({ code: error.code || 'ERROR', message: error.message || 'Request failed' });
  }
  app.log.error(error);
  captureError(error, { route: request?.routerPath, method: request?.method });
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
});

const shutdown = async () => {
  await Promise.all([shutdownAnalytics(), flushSentry()]);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`Backend running on http://localhost:${PORT} (env=${NODE_ENV})`);
} catch (err) {
  app.log.error(err);
  captureError(err);
  await flushSentry();
  process.exit(1);
}
