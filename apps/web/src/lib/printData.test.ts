import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import de from '../i18n/locales/de.js';
import en from '../i18n/locales/en.js';
import type { CompetitionStateInfo, Forecast, MatchInfo } from './api.js';
import type { Translate } from './describe.js';
import {
  certificates,
  crossTable,
  downloadName,
  placementRows,
  placementsCsv,
  placeText,
  resultRows,
  scheduleOverview,
  scheduleRows,
  scoresheets,
  toCsv,
} from './printData.js';

const t = createI18n({ legacy: false, locale: 'de', messages: { en, de } }).global.t as unknown as Translate;

const person = (id: string, name: string, club: string | null) => ({ id, name, club });
const match = (m: Partial<MatchInfo> & Pick<MatchInfo, 'key'>): MatchInfo => ({
  id: m.key,
  phase: 'group',
  group: 0,
  round: 1,
  places: null,
  sides: [null, null],
  sources: null,
  status: 'ready',
  tableId: null,
  calledAt: null,
  finishedAt: null,
  result: null,
  version: 1,
  ...m,
});

/** Group of three (A, B, C) with a final for the top two */
const state: CompetitionStateInfo = {
  competition: {
    id: 'c1',
    eventId: 'e',
    name: 'Einzel',
    kind: 'singles',
    day: null,
    color: 0,
    sortOrder: 0,
    matchRules: { gamesToWin: 3, pointsPerGame: 11, winBy: 2 },
    matchMinutes: 30,
    format: { groups: { groupCount: 1 }, knockout: { qualifiersPerGroup: 2, placements: 'none' } },
    earliestStart: null,
    startAfterId: null,
    tableIds: null,
    drawn: true,
    version: 1,
  },
  entries: [
    { id: 'a', status: 'present', members: [person('pa', 'Anna Berger', 'TTC')] },
    { id: 'b', status: 'present', members: [person('pb', 'Ben Krüger', 'SV')] },
    { id: 'c', status: 'present', members: [person('pc', 'Gast', null)] },
  ],
  groups: [
    {
      group: 0,
      entries: ['a', 'b', 'c'],
      complete: false,
      standings: [
        { entryId: 'a', rank: 1 },
        { entryId: 'b', rank: 2 },
        { entryId: 'c', rank: 3 },
      ] as CompetitionStateInfo['groups'][number]['standings'],
    },
  ],
  matches: [
    match({ key: 'G-1', sides: ['a', 'b'], status: 'finished', result: { winner: 0, games: [[11, 4], [9, 11], [11, 9], [11, 7]] } }),
    match({ key: 'G-2', sides: ['c', 'a'], status: 'finished', result: { winner: 1, games: [], walkover: true } }),
    match({ key: 'G-3', round: 2, sides: ['b', 'c'], status: 'called', tableId: 't2' }),
    match({
      key: 'KO-F',
      phase: 'knockout',
      group: null,
      round: 1,
      places: [1, 2],
      status: 'pending',
      sources: [
        { type: 'qualifier', group: 0, rank: 1 },
        { type: 'qualifier', group: 0, rank: 2 },
      ],
    }),
  ],
  placements: [
    { entryId: 'a', place: 1, placeTo: 1 },
    { entryId: 'b', place: 2, placeTo: 2 },
    { entryId: 'c', place: 3, placeTo: 4 },
  ],
  finished: false,
};
const tableName = (id: string) => ({ t1: '1', t2: '2' })[id];

describe('placeText', () => {
  it('shows single and shared places', () => {
    expect(placeText({ place: 3, placeTo: 3 })).toBe('3.');
    expect(placeText({ place: 5, placeTo: 8 })).toBe('5.–8.');
  });
});

describe('scoresheets', () => {
  it('lists called, ready or all open matches with the number of game rows', () => {
    expect(scoresheets(t, [state], 'called', tableName)).toEqual([
      { key: 'c1:G-3', competition: 'Einzel', label: 'Gruppe A, Runde 2', sides: ['Ben Krüger', 'Gast'], clubs: ['SV', ''], table: '2', games: 5 },
    ]);
    expect(scoresheets(t, [state], 'ready', tableName).map((s) => s.key)).toEqual(['c1:G-3']);
    const open = scoresheets(t, [state], 'open', tableName);
    expect(open.map((s) => s.key)).toEqual(['c1:G-3', 'c1:KO-F']);
    expect(open[1]!.sides).toEqual(['1. Gruppe A', '2. Gruppe A']);
  });
});

describe('crossTable', () => {
  it('shows each score from the row player’s point of view', () => {
    const table = crossTable(t, state, 0);
    expect(table.entries.map((e) => [e.name, e.rank])).toEqual([
      ['Anna Berger', 1],
      ['Ben Krüger', 2],
      ['Gast', 3],
    ]);
    expect(table.cells).toEqual([
      [null, '3:1', 'kampflos gew.'],
      ['1:3', null, ''],
      ['kampflos verl.', '', null],
    ]);
  });
});

describe('results', () => {
  it('lists placements with clubs and finished matches with games', () => {
    expect(placementRows(t, [state]).map((r) => [r.place, r.name, r.clubs])).toEqual([
      ['1.', 'Anna Berger', 'TTC'],
      ['2.', 'Ben Krüger', 'SV'],
      ['3.–4.', 'Gast', ''],
    ]);
    expect(resultRows(t, [state])).toEqual([
      { competition: 'Einzel', label: 'Gruppe A, Runde 1', sides: ['Anna Berger', 'Ben Krüger'], score: '3:1', games: '11:4, 9:11, 11:9, 11:7' },
      { competition: 'Einzel', label: 'Gruppe A, Runde 1', sides: ['Gast', 'Anna Berger'], score: 'kampflos', games: '' },
    ]);
  });

  it('makes certificates for the top places, shared ones included', () => {
    expect(certificates(t, [state], 2).map((r) => r.name)).toEqual(['Anna Berger', 'Ben Krüger']);
    expect(certificates(t, [state], 3).map((r) => r.name)).toEqual(['Anna Berger', 'Ben Krüger', 'Gast']);
  });
});

describe('schedule', () => {
  const forecast = {
    competitions: [{ id: 'c1', start: 600, groupStageEnd: 660, end: 720, endLate: 730, matchMinutes: 30 }],
    matches: [
      { competitionId: 'c1', matchKey: 'KO-F', tableId: 't1', start: 690, end: 720 },
      { competitionId: 'c1', matchKey: 'G-3', tableId: 't2', start: 630, end: 660 },
    ],
  } as unknown as Forecast;

  it('orders the planned matches by time', () => {
    expect(scheduleOverview(forecast, () => 'Einzel')).toEqual([{ competition: 'Einzel', start: '10:00', groupStageEnd: '11:00', end: '12:00' }]);
    expect(scheduleRows(t, forecast, [state], tableName).map((r) => [r.start, r.table, r.label, r.sides.join(' – ')])).toEqual([
      ['10:30', '2', 'Gruppe A, Runde 2', 'Ben Krüger – Gast'],
      ['11:30', '1', 'Finale', '1. Gruppe A – 2. Gruppe A'],
    ]);
  });
});

describe('CSV', () => {
  it('quotes fields with delimiters, quotes and line breaks and starts with a BOM', () => {
    expect(toCsv([['a', 'b;c', 'say "hi"', 'x\ny', 3]], ';')).toBe('﻿a;"b;c";"say ""hi""";"x\ny";3\r\n');
    expect(toCsv([['a,b']], ',')).toBe('﻿"a,b"\r\n');
  });

  it('writes the placements with a translated header', () => {
    expect(placementsCsv(t, [state], ';').split('\r\n').slice(0, 2)).toEqual(['﻿Konkurrenz;Platz;Name;Verein', 'Einzel;1.;Anna Berger;TTC']);
  });
});

describe('downloadName', () => {
  it('names the file after its contents and the event', () => {
    expect(downloadName('Blanko-Schiedsrichterzettel', 'Vereinsmeisterschaft 2026', 'pdf')).toBe('Blanko-Schiedsrichterzettel – Vereinsmeisterschaft 2026.pdf');
  });

  it('drops characters file systems do not allow', () => {
    expect(downloadName('Ergebnisse', 'Cup: Jugend/Herren "A"?', 'csv')).toBe('Ergebnisse – Cup Jugend Herren A.csv');
    expect(downloadName('Ergebnisse', '', 'csv')).toBe('Ergebnisse.csv');
  });
});
