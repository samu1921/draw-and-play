import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { DOMAIN_VERSION } from '@draw-and-play/domain';
import Fastify, { type FastifyInstance } from 'fastify';

export interface AppOptions {
  logLevel?: string;
  webDist?: string | undefined;
  /** Checks the database connection; replaceable in tests. */
  pingDb: () => Promise<boolean>;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logLevel ? { level: options.logLevel } : false,
    trustProxy: true,
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

  if (options.webDist && existsSync(options.webDist)) {
    await app.register(fastifyStatic, { root: options.webDist, wildcard: false });
    // SPA fallback: unknown non-API GETs get index.html and the Vue router takes over.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not Found' });
    });
  }

  return app;
}
