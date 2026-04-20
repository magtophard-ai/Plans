import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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

const app = Fastify({ logger: true });

await app.register(cors, { origin: true, credentials: true });
await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret' });

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

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`Backend running on http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
