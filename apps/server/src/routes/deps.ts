import type { Db } from '../db/client.js';
import type { LegalLinks } from '../legal.js';
import type { Broadcaster } from '../realtime/broadcaster.js';

export interface RouteDeps {
  db: Db;
  broadcaster: Broadcaster;
  sessionTtlHours: number;
  legal: LegalLinks;
}
