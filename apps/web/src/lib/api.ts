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

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      ...(body !== undefined && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiRequestError(0, 'offline');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
  if (!res.ok) throw new ApiRequestError(res.status, data.error ?? 'internal', data.details);
  return data as T;
}

// --- Response types (mirroring the server's views) ---

export interface EventInfo {
  id: string;
  slug: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  settings: { publicRatings?: boolean; shortNames?: boolean };
  pinEnabled: boolean;
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
  firstName?: string;
  lastName?: string;
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
