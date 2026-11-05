import type { CompetitionFormat, MatchResult, MatchRules, Placement, StandingsRow } from '@draw-and-play/domain';

/** An error response from the API: `code` is stable and translated in the UI (`errors.<code>`). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

/** Requests that take longer count as offline, so a hanging connection in a dead spot does not block forever. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        signal: controller.signal,
        ...(body !== undefined && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiRequestError(0, 'offline');
    }
    if (res.status === 204) return undefined as T;
    let data: { error?: string; details?: unknown };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      // A body cut off by the timeout or the network is a connection problem, not an answer.
      if (controller.signal.aborted) throw new ApiRequestError(0, 'offline');
      data = {};
    }
    if (!res.ok) throw new ApiRequestError(res.status, data.error ?? 'internal', data.details);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// --- Response types (mirroring the server's views) ---

export interface EventInfo {
  id: string;
  slug: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  /** Sport profile id, e.g. "table-tennis" */
  sport: string;
  settings: { publicRatings?: boolean; shortNames?: boolean; imprintUrl?: string | null; privacyUrl?: string | null; privacyNote?: string | null };
  pinEnabled: boolean;
  /** The public views need the viewer code */
  viewerProtected?: boolean;
  /** Admins only: the viewer code (null = open) */
  viewerCode?: string | null;
  /** Footer links of the public pages (the event's own, else the installation's) */
  legal?: { imprintUrl: string | null; privacyUrl: string | null; privacyNote: string | null };
}

export interface TableInfo {
  id: string;
  name: string;
}

export interface CompetitionInfo {
  id: string;
  eventId: string;
  name: string;
  kind: 'singles' | 'doubles';
  day: string | null;
  color: number;
  sortOrder: number;
  matchRules: MatchRules;
  matchMinutes: number;
  format: CompetitionFormat;
  earliestStart: number | null;
  startAfterId: string | null;
  tableIds: string[] | null;
  drawn: boolean;
  version: number;
}

export interface EventOverview {
  event: EventInfo;
  tables: TableInfo[];
  competitions: CompetitionInfo[];
}

export interface PersonInfo {
  id: string;
  name: string;
  club: string | null;
  /** Admin views: the name as public views show it */
  publicName?: string;
  firstName?: string;
  lastName?: string | null;
  gender?: 'f' | 'm' | 'd' | null;
  birthYear?: number | null;
  licenceNo?: string | null;
  rating?: number | null;
}

export interface EntryInfo {
  id: string;
  seed?: number | null;
  status: 'registered' | 'present' | 'withdrawn';
  members: PersonInfo[];
}

export type MatchStatus = 'pending' | 'ready' | 'called' | 'finished';

export type SideSource =
  | { type: 'draw' }
  | { type: 'qualifier'; group: number; rank: number }
  | { type: 'winner' | 'loser'; matchKey: string };

export interface MatchInfo {
  id: string | null;
  key: string;
  phase: 'group' | 'knockout';
  group: number | null;
  round: number;
  places: [number, number] | null;
  sides: [string | null, string | null];
  sources: [SideSource, SideSource] | null;
  status: MatchStatus;
  tableId: string | null;
  calledAt: string | null;
  finishedAt: string | null;
  result: MatchResult | null;
  version: number;
}

export interface CompetitionStateInfo {
  competition: CompetitionInfo;
  drawSeed?: string | null;
  entries: EntryInfo[];
  groups: { group: number; entries: string[]; standings: StandingsRow[]; complete: boolean }[];
  matches: MatchInfo[];
  placements: Placement[];
  finished: boolean;
}

export interface SideInfo {
  entryId: string;
  name: string;
  clubs: string[];
  personIds: string[];
  /** Queue only: when this side last finished a match (ISO); null = not played yet */
  restingSince?: string | null;
}

export interface OperationsMatch extends Omit<MatchInfo, 'sides' | 'id'> {
  id: string;
  competitionId: string;
  sides: [SideInfo | null, SideInfo | null];
  busy?: boolean;
}

export interface Operations {
  competitions: { id: string; name: string; color: number; kind: string; matchMinutes: number }[];
  tables: { id: string; name: string; match: OperationsMatch | null }[];
  queue: OperationsMatch[];
  recent: OperationsMatch[];
}

export interface Forecast {
  day: string | null;
  days: string[];
  /** true: planned from now; false: a future day, planned from its first start */
  live: boolean;
  now: number;
  end: number | null;
  endLate: number | null;
  competitions: { id: string; start: number; groupStageEnd: number | null; end: number; endLate: number; matchMinutes: number }[];
  matches: { competitionId: string; matchKey: string; tableId: string; start: number; end: number }[];
  skipped: { id: string; reason: string }[];
}

export interface DisplaySettings {
  slideSeconds: number;
  tables: boolean;
  next: boolean;
  /** Entry lists of competitions that are not drawn yet */
  entries: boolean;
  /** null = all competitions */
  competitionIds: string[] | null;
  todayOnly: boolean;
  /** Show draws live, step by step */
  liveDraw: boolean;
}

export interface DisplayProfile {
  id: string;
  eventId: string;
  name: string;
  settings: DisplaySettings;
  version: number;
  /** Username of whoever created it (admin list only) */
  createdBy?: string | null;
}

export const defaultDisplaySettings: DisplaySettings = {
  slideSeconds: 20,
  tables: true,
  next: true,
  entries: true,
  competitionIds: null,
  todayOnly: false,
  liveDraw: true,
};
