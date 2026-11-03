export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  /** Directory of the built frontend. Empty = do not serve it (e.g. in development, where Vite runs). */
  webDist: string | undefined;
  logLevel: string;
  /** First admin, created on startup if missing */
  adminUsername: string | undefined;
  adminPassword: string | undefined;
  sessionTtlHours: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set (see .env.example).');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT is invalid: ${env.PORT}`);
  }
  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    databaseUrl,
    webDist: env.WEB_DIST || undefined,
    logLevel: env.LOG_LEVEL ?? 'info',
    adminUsername: env.ADMIN_USERNAME || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 24) || 24,
  };
}
