import type { CompetitionStateInfo, Forecast, MatchInfo } from './api.js';
import { competitionText } from './competitionText.js';
import { matchLabel, type Translate } from './describe.js';
import { formatClock } from './time.js';

/**
 * Data for the print pages and the CSV export, prepared without any DOM so it can be tested.
 * Texts come from `t`, so every page and file follows the chosen language.
 */

/** "3." or "5.–8." for places shared because they were not played out */
export function placeText(p: { place: number; placeTo: number }): string {
  return p.place === p.placeTo ? `${p.place}.` : `${p.place}.–${p.placeTo}.`;
}

// --- Score sheets ---

/** called: on a table right now; ready: both sides known, not finished; open: everything not finished yet */
export type ScoresheetScope = 'called' | 'ready' | 'open';

export interface Scoresheet {
  key: string;
  competition: string;
  label: string;
  sides: [string, string];
  clubs: [string, string];
  table: string | null;
  /** Rows for the games: the most a match can take */
  games: number;
}

export function scoresheets(
  t: Translate,
  states: readonly CompetitionStateInfo[],
  scope: ScoresheetScope,
  tableName: (id: string) => string | undefined,
): Scoresheet[] {
  const wanted = (m: MatchInfo) =>
    scope === 'called' ? m.status === 'called' : scope === 'ready' ? m.status === 'ready' || m.status === 'called' : m.status !== 'finished';
  return states.flatMap((state) => {
    const text = competitionText(t, state);
    return state.matches.filter(wanted).map((m) => ({
      key: `${state.competition.id}:${m.key}`,
      competition: state.competition.name,
      label: knockoutAwareLabel(t, state, m),
      sides: [text.sideText(m, 0), text.sideText(m, 1)] as [string, string],
      clubs: [text.clubs(m.sides[0]), text.clubs(m.sides[1])] as [string, string],
      table: m.tableId ? (tableName(m.tableId) ?? null) : null,
      games: 2 * state.competition.matchRules.gamesToWin - 1,
    }));
  });
}

/** "Semifinal 2" in the knockout, "Group A, round 2" in groups */
function knockoutAwareLabel(t: Translate, state: CompetitionStateInfo, m: MatchInfo): string {
  return m.phase === 'knockout' ? competitionText(t, state).numberedLabel(m.key) : matchLabel(t, m);
}

// --- Group sheets ---

/** Cross table of a group: one row per entry, the cell holds the score from the row's point of view */
export interface CrossTable {
  entries: { id: string; name: string; rank: number | null }[];
  /** cells[row][column]; null on the diagonal, '' for matches not played yet */
  cells: (string | null)[][];
}

export function crossTable(t: Translate, state: CompetitionStateInfo, group: number): CrossTable {
  const g = state.groups.find((x) => x.group === group);
  if (!g) return { entries: [], cells: [] };
  const text = competitionText(t, state);
  const rankOf = new Map(g.standings.map((r) => [r.entryId, r.rank]));
  const ids = g.entries;
  const matches = state.matches.filter((m) => m.phase === 'group' && m.group === group && m.status === 'finished' && m.result);
  const cell = (row: string, column: string): string => {
    // Double round robin: every match between the two counts, in order
    const scores = matches
      .filter((m) => (m.sides[0] === row && m.sides[1] === column) || (m.sides[0] === column && m.sides[1] === row))
      .map((m) => {
        const result = m.result!;
        const rowSide = m.sides[0] === row ? 0 : 1;
        if (result.walkover) return result.winner === rowSide ? t('print.walkoverWon') : t('print.walkoverLost');
        const won = result.games.filter(([a, b]) => (rowSide === 0 ? a > b : b > a)).length;
        return `${won}:${result.games.length - won}`;
      });
    return scores.join(' / ');
  };
  return {
    entries: ids.map((id) => ({ id, name: text.name(id), rank: rankOf.get(id) ?? null })),
    cells: ids.map((row) => ids.map((column) => (row === column ? null : cell(row, column)))),
  };
}

// --- Results ---

export interface PlacementRow {
  competition: string;
  place: string;
  /** Best place of the range, for sorting and certificates */
  placeNumber: number;
  name: string;
  clubs: string;
  /** Day of the competition (multi-day events), for the date on certificates */
  day: string | null;
}

export function placementRows(t: Translate, states: readonly CompetitionStateInfo[]): PlacementRow[] {
  return states.flatMap((state) => {
    const text = competitionText(t, state);
    return state.placements.map((p) => ({
      competition: state.competition.name,
      place: placeText(p),
      placeNumber: p.place,
      name: text.name(p.entryId),
      clubs: text.clubs(p.entryId),
      day: state.competition.day,
    }));
  });
}

export interface ResultRow {
  competition: string;
  label: string;
  sides: [string, string];
  score: string;
  games: string;
}

/** Every finished match, in the order of the competition structure */
export function resultRows(t: Translate, states: readonly CompetitionStateInfo[]): ResultRow[] {
  return states.flatMap((state) => {
    const text = competitionText(t, state);
    return state.matches
      .filter((m) => m.status === 'finished' && m.result)
      .map((m) => ({
        competition: state.competition.name,
        label: knockoutAwareLabel(t, state, m),
        sides: [text.name(m.sides[0]), text.name(m.sides[1])] as [string, string],
        score: text.score(m),
        games: text.gameScores(m),
      }));
  });
}

/** Certificates for the places up to `maxPlace`; shared places (e.g. two third places) each get one */
export function certificates(t: Translate, states: readonly CompetitionStateInfo[], maxPlace: number): PlacementRow[] {
  return placementRows(t, states).filter((row) => row.placeNumber <= maxPlace);
}

// --- Schedule ---

export interface ScheduleRow {
  start: string;
  table: string;
  competition: string;
  label: string;
  sides: [string, string];
}

export interface ScheduleOverviewRow {
  competition: string;
  start: string;
  groupStageEnd: string | null;
  end: string;
}

export function scheduleOverview(forecast: Forecast, competitionName: (id: string) => string): ScheduleOverviewRow[] {
  return [...forecast.competitions]
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      competition: competitionName(c.id),
      start: formatClock(c.start),
      groupStageEnd: c.groupStageEnd === null ? null : formatClock(c.groupStageEnd),
      end: formatClock(c.end),
    }));
}

/** The planned matches of the day in order of their expected start */
export function scheduleRows(
  t: Translate,
  forecast: Forecast,
  states: readonly CompetitionStateInfo[],
  tableName: (id: string) => string | undefined,
): ScheduleRow[] {
  const byId = new Map(states.map((s) => [s.competition.id, s]));
  return [...forecast.matches]
    .sort((a, b) => a.start - b.start || (tableName(a.tableId) ?? '').localeCompare(tableName(b.tableId) ?? '', undefined, { numeric: true }))
    .flatMap((planned) => {
      const state = byId.get(planned.competitionId);
      const m = state?.matches.find((x) => x.key === planned.matchKey);
      if (!state || !m) return [];
      const text = competitionText(t, state);
      return [
        {
          start: formatClock(planned.start),
          table: tableName(planned.tableId) ?? '',
          competition: state.competition.name,
          label: knockoutAwareLabel(t, state, m),
          sides: [text.sideText(m, 0), text.sideText(m, 1)] as [string, string],
        },
      ];
    });
}

// --- CSV ---

/**
 * CSV text with a byte order mark, so Excel opens umlauts correctly. German Excel expects semicolons,
 * English Excel commas.
 */
export function toCsv(rows: readonly (readonly (string | number)[])[], delimiter: ';' | ','): string {
  const field = (value: string | number) => {
    const text = String(value);
    return /["\n\r;,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(field).join(delimiter)).join('\r\n')}\r\n`;
}

export function placementsCsv(t: Translate, states: readonly CompetitionStateInfo[], delimiter: ';' | ','): string {
  return toCsv(
    [
      [t('print.csv.competition'), t('print.csv.place'), t('print.csv.name'), t('print.csv.club')],
      ...placementRows(t, states).map((r) => [r.competition, r.place, r.name, r.clubs]),
    ],
    delimiter,
  );
}

export function resultsCsv(t: Translate, states: readonly CompetitionStateInfo[], delimiter: ';' | ','): string {
  return toCsv(
    [
      [t('print.csv.competition'), t('print.csv.match'), t('print.csv.side1'), t('print.csv.side2'), t('print.csv.score'), t('print.csv.games')],
      ...resultRows(t, states).map((r) => [r.competition, r.label, r.sides[0], r.sides[1], r.score, r.games]),
    ],
    delimiter,
  );
}
