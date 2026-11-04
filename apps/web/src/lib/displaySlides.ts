import type { CompetitionInfo, CompetitionStateInfo, DisplaySettings, MatchInfo } from './api.js';

/*
 * The projector shows a fixed 16:9 stage (1920 × 1080). Every slide must fit on it without scrolling, so the
 * content is split into pages here. The limits are sized for the stage's type; a fit-to-box scale in the view
 * catches the rest (e.g. very long names).
 */
export const TABLES_PER_PAGE = 12;
export const NEXT_MATCHES = 14;
export const ENTRIES_PER_PAGE = 36;
/** Matches of a bracket column per page: larger brackets are shown in halves, quarters, … */
export const BRACKET_MATCHES_PER_PAGE = 8;
/** Groups up to this size fit two rows high */
const TWO_ROW_GROUP_SIZE = 7;

interface Paged {
  /** Stable across data updates, so the rotation keeps its place */
  key: string;
  page: number;
  pages: number;
}

export type Slide =
  | (Paged & { kind: 'tables'; tableIds: string[] })
  | (Paged & { kind: 'next' })
  | (Paged & { kind: 'groups'; competitionId: string; groups: number[]; columns: number })
  /** `from`/`to`: part of the bracket on this page, as a fraction (0–1) of its height */
  | (Paged & { kind: 'bracket'; competitionId: string; from: number; to: number })
  | (Paged & { kind: 'placements'; competitionId: string })
  | (Paged & { kind: 'entries'; competitionId: string; entryIds: string[] });

export interface SlideSource {
  settings: DisplaySettings;
  /** Current day as YYYY-MM-DD */
  today: string;
  /** In display order */
  competitions: readonly CompetitionInfo[];
  states: ReadonlyMap<string, CompetitionStateInfo>;
  tableIds: readonly string[];
}

/** Splits `items` into as few pages of at most `size` as possible, with page sizes as even as possible. */
export function paginate<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const pages = Math.ceil(items.length / size);
  const base = Math.floor(items.length / pages);
  const extra = items.length % pages;
  const result: T[][] = [];
  let start = 0;
  for (let p = 0; p < pages; p++) {
    const length = base + (p < extra ? 1 : 0);
    result.push(items.slice(start, start + length));
    start += length;
  }
  return result;
}

/** Groups per page and columns: up to 4 columns (3 for doubles with their longer names), two rows for small groups */
export function groupLayout(groupSizes: readonly number[], doubles: boolean): { pages: number[][]; columns: number[] } {
  const maxColumns = doubles ? 3 : 4;
  const rows = Math.max(0, ...groupSizes) <= TWO_ROW_GROUP_SIZE ? 2 : 1;
  const pages = paginate(
    groupSizes.map((_, g) => g),
    maxColumns * rows,
  );
  return { pages, columns: pages.map((groups) => (groups.length <= maxColumns ? groups.length : Math.ceil(groups.length / rows))) };
}

/** Main bracket (the matches for place 1) as rounds, first round first */
export function mainBracketRounds(matches: readonly MatchInfo[]): MatchInfo[][] {
  const main = matches.filter((m) => m.phase === 'knockout' && m.places?.[0] === 1);
  const rounds = [...new Set(main.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.map((round) => main.filter((m) => m.round === round));
}

/**
 * The matches of a round with `count` matches that belong to the part `from`–`to` (fractions of the bracket's
 * height). Proportional, because with byes the second round can have as many matches as the first.
 */
export function bracketWindow(count: number, from: number, to: number): [number, number] {
  const start = Math.min(count - 1, Math.floor(from * count + 1e-9));
  return [start, Math.max(start + 1, Math.ceil(to * count - 1e-9))];
}

export function competitionShown(c: CompetitionInfo, settings: DisplaySettings, today: string): boolean {
  if (settings.competitionIds && !settings.competitionIds.includes(c.id)) return false;
  return !settings.todayOnly || c.day === null || c.day === today;
}

export function buildSlides({ settings, today, competitions, states, tableIds }: SlideSource): Slide[] {
  const slides: Slide[] = [];
  const pushPages = <T>(pages: T[][], make: (items: T[], page: number, pages: number) => Slide) =>
    pages.forEach((items, page) => slides.push(make(items, page, pages.length)));

  if (settings.tables) {
    pushPages(paginate(tableIds, TABLES_PER_PAGE), (ids, page, pages) => ({ key: `tables:${page}`, kind: 'tables', tableIds: ids, page, pages }));
  }
  if (settings.next) slides.push({ key: 'next', kind: 'next', page: 0, pages: 1 });

  for (const c of competitions) {
    const state = states.get(c.id);
    if (!state || !competitionShown(c, settings, today)) continue;
    if (!c.drawn) {
      if (!settings.entries) continue;
      const entryIds = state.entries
        .filter((e) => e.status !== 'withdrawn')
        .map((e) => ({ id: e.id, name: e.members.map((m) => m.name).join(' / ') }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => e.id);
      pushPages(paginate(entryIds, ENTRIES_PER_PAGE), (ids, page, pages) => ({
        key: `entries:${c.id}:${page}`,
        kind: 'entries',
        competitionId: c.id,
        entryIds: ids,
        page,
        pages,
      }));
      continue;
    }

    const layout = groupLayout(
      state.groups.map((g) => g.entries.length),
      c.kind === 'doubles',
    );
    layout.pages.forEach((groups, page) =>
      slides.push({ key: `groups:${c.id}:${page}`, kind: 'groups', competitionId: c.id, groups, columns: layout.columns[page]!, page, pages: layout.pages.length }),
    );

    const tallest = Math.max(0, ...mainBracketRounds(state.matches).map((round) => round.length));
    const bracketPages = Math.ceil(tallest / BRACKET_MATCHES_PER_PAGE);
    for (let page = 0; page < bracketPages; page++) {
      slides.push({ key: `bracket:${c.id}:${page}`, kind: 'bracket', competitionId: c.id, from: page / bracketPages, to: (page + 1) / bracketPages, page, pages: bracketPages });
    }

    if (state.finished && state.placements.length > 0) {
      slides.push({ key: `placements:${c.id}`, kind: 'placements', competitionId: c.id, page: 0, pages: 1 });
    }
  }
  return slides;
}

/** The order in which a live draw reveals entries: row by row across the groups (group heads first) */
export function groupRevealOrder(state: CompetitionStateInfo): string[] {
  const order: string[] = [];
  const rows = Math.max(0, ...state.groups.map((g) => g.entries.length));
  for (let row = 0; row < rows; row++) {
    for (const g of state.groups) {
      const id = g.entries[row];
      if (id) order.push(id);
    }
  }
  return order;
}
