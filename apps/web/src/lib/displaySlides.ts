import type { CompetitionInfo, CompetitionStateInfo, DisplaySettings, MatchInfo } from './api.js';
import { bracketViews, currentSwissRound, placementGroupViews, rotationRoundViews, type BracketView } from './stages.js';

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
/** Explained ties per page, in two columns */
export const TIES_PER_PAGE = 4;
/** Rows of a Swiss table per page */
export const TABLE_ROWS_PER_PAGE = 16;
/** Consolation fields of three per page, side by side */
export const FIELDS_PER_PAGE = 2;
/** Pairings of a Swiss round per page, in two columns */
export const PAIRINGS_PER_PAGE = 16;
/** Matches of a round with rotating partners per page: four names each */
export const ROTATION_MATCHES_PER_PAGE = 8;
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
  /** `rows`: part of a long table on this page (a Swiss table), as row indexes from–to */
  | (Paged & { kind: 'groups'; competitionId: string; groups: number[]; columns: number; rows?: [number, number] })
  /** The pairings of the current round of a Swiss system, or of rotating partners */
  | (Paged & { kind: 'round'; competitionId: string; round: number; matchKeys: string[] })
  /** `from`/`to`: part of the bracket on this page, as a fraction (0–1) of its height; `stage`: a consolation bracket */
  | (Paged & { kind: 'bracket'; competitionId: string; from: number; to: number; stage?: string })
  /** Consolation fields of three (`stages`) with their tables and matches */
  | (Paged & { kind: 'fields'; competitionId: string; stages: string[] })
  | (Paged & { kind: 'placements'; competitionId: string })
  /** How ties in finished groups were broken: tie `index` of `group` */
  | (Paged & { kind: 'ties'; competitionId: string; ties: { group: number; index: number }[] })
  /** Format and ranking rules of the competition */
  | (Paged & { kind: 'rules'; competitionId: string })
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

/** A bracket is being played once one of its matches knows both players */
export function bracketStarted(bracket: BracketView): boolean {
  return [...bracket.rounds.flat(), ...bracket.placementMatches].some((m) => (m.sides[0] && m.sides[1]) || m.status === 'called' || m.status === 'finished');
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
    // A screen for information only (tables, next matches, format) leaves the standings to another screen
    if (!settings.standings) {
      if (settings.rules) slides.push({ key: `rules:${c.id}`, kind: 'rules', competitionId: c.id, page: 0, pages: 1 });
      continue;
    }

    // Only the phase being played: the groups until the first bracket starts (both overlap while the last groups
    // finish), then the brackets; once finished, the placements next to the last phase.
    const groupPhase = state.groups.length > 0;
    const brackets = bracketViews(state.matches).filter((b) => !groupPhase || state.finished || bracketStarted(b));
    const showGroups = groupPhase && (brackets.length === 0 || state.groups.some((g) => !g.complete));

    const rotation = state.matches.some((m) => m.phase === 'rotation');
    if (showGroups && (state.swiss || rotation)) {
      // One table with everybody, page by page, then the pairings of the round being played
      const rows = state.groups[0]?.standings.map((_, i) => i) ?? [];
      pushPages(paginate(rows, TABLE_ROWS_PER_PAGE), (items, page, pages) => ({
        key: `groups:${c.id}:${page}`,
        kind: 'groups',
        competitionId: c.id,
        groups: [0],
        columns: 1,
        rows: [items[0]!, items.at(-1)! + 1],
        page,
        pages,
      }));
      const round = rotation ? rotationRoundViews(state).find((r) => !r.complete) : currentSwissRound(state);
      if (round && !state.groups[0]?.complete) {
        const perPage = rotation ? ROTATION_MATCHES_PER_PAGE : PAIRINGS_PER_PAGE;
        pushPages(paginate(round.matches.map((m) => m.key), perPage), (matchKeys, page, pages) => ({
          key: `round:${c.id}:${page}`,
          kind: 'round',
          competitionId: c.id,
          round: round.round,
          matchKeys,
          page,
          pages,
        }));
      }
    } else if (showGroups) {
      const layout = groupLayout(
        state.groups.map((g) => g.entries.length),
        c.kind === 'doubles',
      );
      layout.pages.forEach((groups, page) =>
        slides.push({ key: `groups:${c.id}:${page}`, kind: 'groups', competitionId: c.id, groups, columns: layout.columns[page]!, page, pages: layout.pages.length }),
      );
    }

    if (showGroups && settings.rules) {
      // Only finished groups: while a group runs, its ties change with every result.
      const ties = state.groups.filter((g) => g.complete).flatMap((g) => (g.tieBreaks ?? []).map((_, index) => ({ group: g.group, index })));
      pushPages(paginate(ties, TIES_PER_PAGE), (items, page, pages) => ({ key: `ties:${c.id}:${page}`, kind: 'ties', competitionId: c.id, ties: items, page, pages }));
    }

    // The main bracket, then the consolation brackets
    for (const bracket of brackets) {
      const tallest = Math.max(0, ...bracket.rounds.map((round) => round.length));
      const bracketPages = Math.ceil(tallest / BRACKET_MATCHES_PER_PAGE);
      const main = bracket.stage === 'KO';
      for (let page = 0; page < bracketPages; page++) {
        slides.push({
          key: main ? `bracket:${c.id}:${page}` : `bracket:${c.id}:${bracket.stage}:${page}`,
          kind: 'bracket',
          competitionId: c.id,
          from: page / bracketPages,
          to: (page + 1) / bracketPages,
          ...(!main && { stage: bracket.stage }),
          page,
          pages: bracketPages,
        });
      }
    }

    // Consolation fields of three, once the groups have decided who plays in them
    const fields = placementGroupViews(state).filter((f) => f.group.entries.length > 0).map((f) => f.stage);
    pushPages(paginate(fields, FIELDS_PER_PAGE), (stages, page, pages) => ({ key: `fields:${c.id}:${page}`, kind: 'fields', competitionId: c.id, stages, page, pages }));

    if (state.finished && state.placements.length > 0) {
      slides.push({ key: `placements:${c.id}`, kind: 'placements', competitionId: c.id, page: 0, pages: 1 });
    }
    if (settings.rules) slides.push({ key: `rules:${c.id}`, kind: 'rules', competitionId: c.id, page: 0, pages: 1 });
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
