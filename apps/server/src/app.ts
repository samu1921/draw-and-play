import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { DOMAIN_VERSION } from '@draw-and-play/domain';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db/client.js';
import { ApiError } from './errors.js';
import type { LegalLinks } from './legal.js';
import { Broadcaster } from './realtime/broadcaster.js';
import { brandingRoutes } from './routes/branding.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { competitionRoutes } from './routes/competitions.js';
import { deviceRoutes } from './routes/devices.js';
import { displayRoutes } from './routes/displays.js';
import { eventRoutes } from './routes/events.js';
import { transferRoutes } from './routes/transfer.js';
import { userRoutes } from './routes/users.js';
import { viewerRoutes } from './routes/viewers.js';

export interface AppOptions {
  logLevel?: string;
  webDist?: string | undefined;
  /** Checks the database connection; replaceable in tests. */
  pingDb: () => Promise<boolean>;
  /** Without a database only the health check and static files are served */
  db?: Db;
  broadcaster?: Broadcaster;
  sessionTtlHours?: number;
  /** Default footer links for the public pages */
  legal?: LegalLinks;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IMAGE_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logLevel ? { level: options.logLevel } : false,
    trustProxy: true,
  });

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });

  // CSRF protection on top of SameSite cookies: cross-site forms cannot send JSON,
  // so state-changing API requests with any other body type are rejected.
  // Image uploads are the one exception: forms cannot send image types either.
  app.addHook('onRequest', async (request) => {
    if (!MUTATING.has(request.method) || !request.url.startsWith('/api/')) return;
    const type = request.headers['content-type']?.toLowerCase();
    if (request.method === 'POST' && request.url.split('?')[0] === '/api/assets' && type && IMAGE_UPLOAD_TYPES.includes(type)) return;
    if (type !== undefined && !type.startsWith('application/json')) {
      throw new ApiError(415, 'jsonRequired');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.status).send({ error: error.code, ...(error.details !== undefined && { details: error.details }) });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: 'tooManyRequests' });
    if (status && status < 500) return reply.code(status).send({ error: 'badRequest', details: { message: (error as Error).message } });
    request.log.error(error);
    return reply.code(500).send({ error: 'internal' });
  });

  // Polled by the Docker health check every few seconds, so kept out of the info log.
  app.get('/api/health', { logLevel: 'warn' }, async (_request, reply) => {
    const dbOk = await options.pingDb();
    return reply.code(dbOk ? 200 : 503).send({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'unreachable',
      domainVersion: DOMAIN_VERSION,
    });
  });

  if (options.db) {
    // Registered directly (not via app.register) so the auth hook applies to every route.
    const deps = {
      db: options.db,
      broadcaster: options.broadcaster ?? new Broadcaster(),
      sessionTtlHours: options.sessionTtlHours ?? 24,
      legal: options.legal ?? { imprintUrl: null, privacyUrl: null },
    };
    await authRoutes(app, deps);
    await eventRoutes(app, deps);
    await competitionRoutes(app, deps);
    await deviceRoutes(app, deps);
    await displayRoutes(app, deps);
    await transferRoutes(app, deps);
    await viewerRoutes(app, deps);
    await auditRoutes(app, deps);
    await userRoutes(app, deps);
    await brandingRoutes(app, deps);
  } else {
    /** Installation-wide settings the frontend needs before it knows an event */
    app.get('/api/config', async () => ({ legal: options.legal ?? { imprintUrl: null, privacyUrl: null }, branding: {} }));
  }

  if (options.webDist && existsSync(options.webDist)) {
    await app.register(fastifyStatic, { root: options.webDist, wildcard: false });
    // SPA fallback: unknown non-API GETs get index.html and the Vue router takes over.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'notFound' });
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'notFound' }));
  }

  return app;
}
