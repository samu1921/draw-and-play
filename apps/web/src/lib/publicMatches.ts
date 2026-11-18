import type { CompetitionStateInfo, SideInfo } from './api.js';

/** Lower case without accents, so "muller" finds "Müller" */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Whether a side's name or club contains the (normalised) search text; an empty search matches everything */
export function sidesMatch(sides: readonly (Pick<SideInfo, 'name' | 'clubs'> | null)[], search: string): boolean {
  if (search === '') return true;
  return sides.some((s) => s !== null && [s.name, ...s.clubs].some((text) => normalizeSearch(text).includes(search)));
}

interface Queued {
  competitionId: string;
  key: string;
  busy?: boolean;
}

/**
 * Ready matches in the order the desk is likely to call them: by the start the forecast plans for them,
 * matches with a player still at a table after the others. Without a plan, the server's order stays.
 */
export function nextOrder<T extends Queued>(queue: readonly T[], planned: ReadonlyMap<string, number>): T[] {
  const start = (m: T) => planned.get(`${m.competitionId}:${m.key}`) ?? Number.MAX_SAFE_INTEGER;
  return [...queue].sort((a, b) => start(a) - start(b) || Number(a.busy ?? false) - Number(b.busy ?? false));
}

/** Most recent first: matches finished most recently come first, those without a time at the end */
export function recentOrder<T extends { finishedAt: string | null }>(matches: readonly T[]): T[] {
  const time = (m: T) => (m.finishedAt ? new Date(m.finishedAt).getTime() : 0);
  return [...matches].sort((a, b) => time(b) - time(a));
}

/** Where a competition stands for the public: not drawn yet, running with matches played of all, or finished */
export type CompetitionProgress = { stage: 'notDrawn' } | { stage: 'running'; played: number; total: number } | { stage: 'finished' };

export function competitionProgress(state: Pick<CompetitionStateInfo, 'finished' | 'matches'> & { competition: { drawn: boolean } }): CompetitionProgress {
  if (!state.competition.drawn) return { stage: 'notDrawn' };
  if (state.finished) return { stage: 'finished' };
  return { stage: 'running', played: state.matches.filter((m) => m.status === 'finished').length, total: state.matches.length };
}
