import { buildStructure, generateVariants, tableTennis, type CompetitionFormat } from '@draw-and-play/domain';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import de from '../i18n/locales/de.js';
import en from '../i18n/locales/en.js';
import type { CompetitionStateInfo, MatchInfo } from './api.js';
import { competitionText } from './competitionText.js';
import { describeFormat, matchLabel, sameBaseFormat, sameFormat, type Translate } from './describe.js';
import { buildSlides } from './displaySlides.js';
import { defaultFormatForm, formatFormOf, formatSettings } from './formatForm.js';
import { competitionRules, criterionValueText } from './rules.js';
import { bracketViews, placementGroupViews, swissRoundViews } from './stages.js';

const translator = (locale: 'en' | 'de') =>
  createI18n({ legacy: false, locale, messages: { en, de }, missingWarn: false, fallbackWarn: false }).global.t as unknown as Translate;

const swiss: CompetitionFormat = { swiss: { rounds: 6 } };
const swissTop4: CompetitionFormat = { swiss: { rounds: 5 }, knockout: { qualifiersPerGroup: 4, placements: 'thirdPlace' } };
const filled: CompetitionFormat = { groups: { groupCount: 3 }, knockout: { qualifiersPerGroup: 2, placements: 'all', fillByes: true } };
const consolation = (mode: 'bracket' | 'perRank'): CompetitionFormat => ({
  groups: { groupCount: 3 },
  knockout: { qualifiersPerGroup: 2, placements: 'all', consolation: mode },
});

describe('describeFormat', () => {
  it.each([
    ['de', swiss, 16, 'Schweizer System, 6 Runden'],
    ['en', { swiss: { rounds: 1 } }, 2, 'Swiss system, 1 round'],
    ['de', swissTop4, 12, 'Schweizer System, 5 Runden, Top 4 → Halbfinale'],
    ['de', filled, 12, 'Gruppen 3 × 4, Top 2 + 2 beste 3. → Viertelfinale'],
    ['en', filled, 12, 'Groups 3 × 4, top 2 + 2 best 3. → quarterfinals'],
    ['de', consolation('bracket'), 12, 'Gruppen 3 × 4, Top 2 → Viertelfinale, 2 Freilose, Trostrunde'],
    ['en', consolation('perRank'), 12, 'Groups 3 × 4, top 2 → quarterfinals, 2 byes, placement brackets per group rank'],
  ] as const)('%s: %j with %i entries', (locale, format, entries, expected) => {
    expect(describeFormat(translator(locale), format, entries)).toBe(expected);
  });
});

describe('sameFormat', () => {
  it('tells settings apart, sameBaseFormat does not', () => {
    expect(sameFormat(swiss, { swiss: { rounds: 6 } })).toBe(true);
    expect(sameFormat(swiss, { swiss: { rounds: 5 } })).toBe(false);
    expect(sameBaseFormat(swiss, { swiss: { rounds: 5 } })).toBe(true);
    expect(sameFormat(consolation('bracket'), consolation('perRank'))).toBe(false);
    expect(sameBaseFormat(consolation('bracket'), filled)).toBe(true);
    expect(sameBaseFormat(swiss, { groups: { groupCount: 1 } })).toBe(false);
  });
});

describe('format form', () => {
  it('round-trips a stored format through the form', () => {
    for (const format of [swiss, swissTop4, filled, consolation('perRank')]) {
      const entries = 12;
      const variants = generateVariants(entries, formatSettings(formatFormOf(format)));
      expect(variants.some((v) => sameFormat(v.format, format))).toBe(true);
    }
  });

  it('leaves out what is switched off', () => {
    expect(formatSettings(defaultFormatForm())).toEqual({ placements: 'none' });
    expect(formatSettings({})).toEqual({ placements: 'none' });
    expect(formatSettings({ placements: 'all', consolation: 'bracket', fillByes: true, swissRounds: 5 })).toEqual({ placements: 'all', consolation: 'bracket', fillByes: true, swissRounds: 5 });
  });
});

describe('matchLabel', () => {
  it('labels Swiss rounds and consolation matches', () => {
    const s = buildStructure(swiss, 8);
    expect(matchLabel(translator('de'), s.matches.find((m) => m.round === 3)!)).toBe('Runde 3');
    expect(matchLabel(translator('en'), s.matches.find((m) => m.round === 3)!, true)).toBe('Rd 3');
    const c = buildStructure(consolation('bracket'), 12);
    const first = c.matches.find((m) => m.stage === 'C1' && m.round === 1)!;
    // Six entries in a bracket of eight: shown without the places the byes leave empty
    expect(matchLabel(translator('de'), first)).toBe('Platz 7–12');
    const last = c.matches.filter((m) => m.stage === 'C1').at(-1)!;
    expect(matchLabel(translator('de'), last)).toMatch(/^Spiel um Platz \d+$/);
  });
});

describe('competitionRules', () => {
  const rules = (locale: 'en' | 'de', format: CompetitionFormat, entryCount: number, compact = false) =>
    competitionRules(translator(locale), {
      format,
      matchRules: tableTennis.defaultMatchRules,
      ranking: tableTennis.ranking,
      swissRanking: tableTennis.swissRanking,
      entryCount,
      drawn: true,
      compact,
    });
  const allText = (sections: ReturnType<typeof rules>) => sections.flatMap((s) => [s.title, ...s.paragraphs, ...(s.ordered ?? []), ...(s.items ?? [])]);

  it('has a text for everything in both languages', () => {
    for (const locale of ['de', 'en'] as const) {
      for (const format of [swiss, swissTop4, filled, consolation('bracket'), consolation('perRank'), { ...consolation('perRank'), knockout: { ...consolation('perRank').knockout!, fillByes: true } }]) {
        for (const compact of [false, true]) {
          const text = allText(rules(locale, format, 12, compact));
          // A missing translation shows up as its key
          expect(text.filter((line) => /\b(rules|format|public|round|match)\.[a-zA-Z.]+/.test(line))).toEqual([]);
        }
      }
    }
  });

  it('explains the Swiss table in the order of the rulebook', () => {
    const section = rules('de', swiss, 16).find((s) => s.title === 'Schweizer System und Tabelle')!;
    expect(section.paragraphs[0]).toContain('6 Runden');
    expect(section.ordered!.map((line) => line.split(':')[0])).toEqual(['Siege', 'Buchholzzahl', 'Direkter Vergleich', 'Los']);
    expect(allText(rules('de', swiss, 16)).at(-1)).toBe('Der Tabellenplatz ist die Platzierung.');
  });

  it('names the pairings and places after a Swiss system with a knockout', () => {
    const sections = rules('de', swissTop4, 12);
    const advance = sections.find((s) => s.title === 'Weiterkommen')!;
    expect(advance.paragraphs[0]).toBe('Die besten 4 der Tabelle kommen in die KO-Runde.');
    // In bracket order: the second of the table sits at the bottom
    expect(advance.items).toEqual(['1. – 4.', '3. – 2.']);
    expect(sections.at(-1)!.items!.at(-1)).toBe('Ab Platz 5: Der Tabellenplatz ist die Platzierung.');
  });

  it('explains the best thirds and where the others end up', () => {
    const sections = rules('de', filled, 12);
    const advance = sections.find((s) => s.title === 'Weiterkommen')!;
    expect(advance.paragraphs[1]).toBe('Dazu kommen die 2 besten 3. aller Gruppen, damit im KO-Feld niemand ein Freilos hat.');
    expect(advance.items!.filter((line) => line.includes('bester 3.'))).toHaveLength(2);
    expect(advance.items!.some((line) => line.includes('Freilos'))).toBe(false);
    expect(sections.at(-1)!.items!.slice(-2)).toEqual(['Die übrigen 3. der Gruppen: Platz 9', 'Alle 4. der Gruppen: gemeinsam Platz 10–12']);
  });

  it('lists the places of the consolation brackets', () => {
    const places = rules('de', consolation('perRank'), 10).at(-1)!.items!;
    // Groups of 4/3/3: three thirds play everybody against everybody for 7–9, the only fourth is 10th
    expect(places.at(-1)).toBe('A4: Platz 10');
    expect(places).toContain('Platz 7–9: jeder gegen jeden, nach der Tabelle');
    // Main bracket, consolation, its knockout mode and who gets its byes
    const mode = rules('en', consolation('bracket'), 12).find((s) => s.title === 'Knockout')!;
    expect(mode.paragraphs).toHaveLength(4);
    expect(mode.paragraphs.at(-1)).toMatch(/^The byes there go to the best/);
  });

  it('describes fields of three without a knockout', () => {
    const mode = rules('de', consolation('perRank'), 12).find((s) => s.title === 'KO-Runde')!;
    expect(mode.paragraphs.at(-1)).toMatch(/^Jedes Feld hat drei Spieler/);
    expect(mode.paragraphs.join(' ')).not.toMatch(/Freilose bekommen/);
  });
});

describe('criterionValueText', () => {
  it('shows a Buchholz score as a single number', () => {
    expect(criterionValueText('buchholz', [7, 0])).toBe('7');
  });
});

// --- Views built from the API state ---

const match = (key: string, phase: MatchInfo['phase'], round: number, extra: Partial<MatchInfo> = {}): MatchInfo => ({
  id: key,
  key,
  phase,
  group: null,
  round,
  places: null,
  sides: [null, null],
  sources: null,
  status: 'pending',
  tableId: null,
  calledAt: null,
  finishedAt: null,
  result: null,
  version: 0,
  ...extra,
});

describe('consolation fields of three', () => {
  it('labels their matches by the places they play for', () => {
    const structure = buildStructure(consolation('perRank'), 12);
    const m = structure.matches.find((x) => x.phase === 'placement')!;
    expect(matchLabel(translator('de'), m)).toBe('Platz 7–9');
    expect(matchLabel(translator('en'), m, true)).toBe('P7–9');
  });

  it('lists a field with its table and matches, apart from the brackets', () => {
    const state = {
      matches: [
        match('KO-1', 'knockout', 1, { stage: 'KO', places: [1, 2] }),
        match('C1-1-1', 'placement', 1, { stage: 'C1', places: [3, 5] }),
        match('C1-2-1', 'placement', 2, { stage: 'C1', places: [3, 5] }),
      ],
      placementGroups: [{ stage: 'C1', places: [3, 5], entries: [], standings: [], tieBreaks: [], complete: false }],
    } as unknown as CompetitionStateInfo;
    expect(placementGroupViews(state).map((v) => [v.stage, v.places, v.matches.map((m) => m.key)])).toEqual([['C1', [3, 5], ['C1-1-1', 'C1-2-1']]]);
    expect(bracketViews(state.matches).map((v) => v.stage)).toEqual(['KO']);
  });

  it('gets a projector slide once the groups have decided who plays in it', () => {
    const field = (entries: string[]) => ({ stage: 'C1', places: [3, 5], entries, standings: [], tieBreaks: [], complete: false });
    const slides = (entries: string[]) =>
      buildSlides({
        settings: { tables: false, next: false, competitions: true, rules: false, todayOnly: false } as never,
        today: '2026-01-01',
        competitions: [{ id: 'c', drawn: true, day: null } as never],
        states: new Map([['c', { competition: { id: 'c', drawn: true }, entries: [], groups: [], matches: [], placementGroups: [field(entries)], placements: [], finished: false } as unknown as CompetitionStateInfo]]),
        tableIds: [],
      }).filter((s) => s.kind === 'fields');
    expect(slides([])).toEqual([]);
    expect(slides(['a', 'b', 'c'])).toMatchObject([{ kind: 'fields', competitionId: 'c', stages: ['C1'], page: 0, pages: 1 }]);
  });

  it('names an open seat that is filled by the comparison across the groups', () => {
    const state = {
      competition: { format: consolation('bracket') },
      entries: [],
      matches: [],
      nextRanked: null,
    } as unknown as CompetitionStateInfo;
    const open = match('C1-r1p7m2', 'knockout', 1, { sources: [{ type: 'bestNext', rank: 3, advancing: false, index: 2 }, { type: 'bestNext', rank: 4, advancing: false, index: 0 }] });
    expect(competitionText(translator('de'), state).sideText(open, 0)).toBe('Ein 3. der Gruppen');
    expect(competitionText(translator('en'), state).sideText(open, 1)).toBe('A 4. of the groups');
  });
});

describe('bracketViews', () => {
  it('separates the main bracket from the consolation brackets', () => {
    const views = bracketViews([
      match('KO-1', 'knockout', 1, { stage: 'KO', places: [1, 4] }),
      match('KO-2', 'knockout', 1, { stage: 'KO', places: [1, 4] }),
      match('KO-3', 'knockout', 2, { stage: 'KO', places: [1, 2] }),
      match('KO-4', 'knockout', 2, { stage: 'KO', places: [3, 4] }),
      match('C1-1', 'knockout', 1, { stage: 'C1', places: [5, 8] }),
      match('C1-2', 'knockout', 2, { stage: 'C1', places: [5, 6] }),
      match('C1-3', 'knockout', 2, { stage: 'C1', places: [7, 8] }),
      match('GA-1', 'group', 1),
    ]);
    expect(views.map((v) => [v.stage, v.places, v.rounds.map((r) => r.length), v.placementMatches.map((m) => m.key)])).toEqual([
      ['KO', [1, 4], [2, 1], ['KO-4']],
      ['C1', [5, 8], [1, 1], ['C1-3']],
    ]);
  });

  it('treats matches of older servers as the main bracket', () => {
    expect(bracketViews([match('KO-1', 'knockout', 1, { places: [1, 2] })])[0]).toMatchObject({ stage: 'KO', places: [1, 2] });
  });
});

describe('Swiss views', () => {
  const state = {
    competition: { id: 'c', kind: 'singles', drawn: true, day: null, format: swiss },
    entries: Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, status: 'present', members: [{ id: `p${i}`, name: `Player ${i}`, club: null }] })),
    groups: [{ group: 0, entries: ['e0', 'e1', 'e2', 'e3', 'e4'], standings: Array.from({ length: 5 }, (_, i) => ({ entryId: `e${i}`, rank: i + 1 })), complete: false }],
    matches: [
      match('SW-1-1', 'swiss', 1, { sides: ['e0', 'e2'], status: 'ready' }),
      match('SW-1-2', 'swiss', 1, { sides: ['e1', 'e3'], status: 'ready' }),
      match('SW-2-1', 'swiss', 2, { sources: [{ type: 'swiss' }, { type: 'swiss' }] }),
      match('SW-2-2', 'swiss', 2, { sources: [{ type: 'swiss' }, { type: 'swiss' }] }),
    ],
    swiss: { rounds: 2, paired: [{ round: 1, bye: 'e4' }] },
    placements: [],
    finished: false,
  } as unknown as CompetitionStateInfo;

  it('lists the paired rounds with their bye', () => {
    expect(swissRoundViews(state).map((r) => [r.round, r.paired, r.matches.length, r.bye])).toEqual([
      [1, true, 2, 'e4'],
      [2, false, 0, null],
    ]);
  });

  it('names the sides of a round that is not paired yet', () => {
    expect(competitionText(translator('de'), state).sideText(state.matches[2]!, 0)).toBe('wird noch gepaart');
  });

  it('shows the table and the current round on the projector', () => {
    const slides = buildSlides({
      settings: { slideSeconds: 20, tables: false, next: false, entries: true, competitionIds: null, todayOnly: false, liveDraw: true, rules: false },
      today: '2026-01-01',
      competitions: [state.competition],
      states: new Map([['c', state]]),
      tableIds: [],
    });
    expect(slides.map((s) => s.kind)).toEqual(['groups', 'round']);
    expect(slides[0]).toMatchObject({ groups: [0], rows: [0, 5] });
    expect(slides[1]).toMatchObject({ round: 1, matchKeys: ['SW-1-1', 'SW-1-2'] });
  });
});
