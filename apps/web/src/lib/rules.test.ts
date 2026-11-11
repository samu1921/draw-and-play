import { explainStandings, tableTennis, type StandingsMatch } from '@draw-and-play/domain';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import de from '../i18n/locales/de.js';
import en from '../i18n/locales/en.js';
import type { Translate } from './describe.js';
import { competitionRules, criterionValueText, tieBreakText } from './rules.js';

const translator = (locale: 'en' | 'de') =>
  createI18n({ legacy: false, locale, messages: { en, de } }).global.t as unknown as Translate;

function m(a: string, b: string, notation: string): StandingsMatch {
  const parsed = tableTennis.parseResult(notation, tableTennis.defaultMatchRules);
  if (!parsed.ok || parsed.outcome.status !== 'finished') throw new Error(`test data: ${notation}`);
  return { a, b, result: { winner: parsed.outcome.winner, games: parsed.games } };
}

describe('criterionValueText', () => {
  it('shows wins as a record and differences with their score', () => {
    expect(criterionValueText('matchPoints', [2, 1])).toBe('2:1');
    expect(criterionValueText('gameDiff', [7, 4])).toBe('+3 (7:4)');
    expect(criterionValueText('pointDiff', [90, 99])).toBe('−9 (90:99)');
    expect(criterionValueText('gameDiff', [5, 5])).toBe('0 (5:5)');
    expect(criterionValueText('gameRatio', [6, 0])).toBe('∞ (6:0)');
  });
});

describe('tieBreakText', () => {
  it('explains game difference and the duel step by step', () => {
    const matches = [m('A', 'B', '1 1 1'), m('B', 'C', '1 1 -1 1'), m('C', 'A', '1 1 -1 -1 1')];
    const { rows, tieBreaks } = explainStandings(['A', 'B', 'C'], matches, tableTennis.ranking);
    const text = tieBreakText(translator('de'), tieBreaks[0]!, {
      name: (id) => id,
      rankOf: (id) => rows.find((r) => r.entryId === id)!.rank,
      duels: () => ['B – C 3:1'],
    });
    expect(text).toEqual({
      title: 'Platz 1–3: gleiche Bilanz',
      level: 'A 1:1 · B 1:1 · C 1:1',
      steps: [
        'Satzdifferenz: A +2 (5:3) · B −1 (3:4) · C −1 (4:5) → A › B = C',
        'Balldifferenz: B −10 (37:47) · C −10 (49:59) → keine Entscheidung',
        'Direkter Vergleich zwischen B, C, ab hier zählen nur ihre Spiele untereinander: B – C 3:1',
        'Spieldifferenz (nur Spiele untereinander): B +1 (1:0) · C −1 (0:1) → B › C',
      ],
    });
  });
});

describe('competitionRules', () => {
  const rules = tableTennis.defaultMatchRules;

  it('describes groups with a knockout: criteria, pairings and places', () => {
    const sections = competitionRules(translator('de'), {
      format: { groups: { groupCount: 4 }, knockout: { qualifiersPerGroup: 2, placements: 'none' } },
      matchRules: rules,
      ranking: tableTennis.ranking,
      entryCount: 16,
      drawn: true,
    });
    const byTitle = Object.fromEntries(sections.map((s) => [s.title, s]));
    expect(byTitle['Ablauf']!.paragraphs).toEqual(['Gruppen 4 × 4, Top 2 → Viertelfinale']);
    expect(byTitle['Spiele']!.paragraphs[0]).toBe(
      'Ein Spiel gewinnt, wer zuerst 3 Sätze gewinnt (Best of 5). Ein Satz geht bis 11 Punkte, mit mindestens 2 Punkten Vorsprung.',
    );
    // DTTB WO D 7.5
    expect(byTitle['Gruppenphase und Tabelle']!.ordered!.map((c) => c.split(':')[0])).toEqual([
      'Siege und Niederlagen',
      'Satzdifferenz',
      'Balldifferenz',
      'Direkter Vergleich',
      'Los',
    ]);
    expect(byTitle['Gruppenphase und Tabelle']!.ordered![3]).toContain('Spieldifferenz, Satzdifferenz, Balldifferenz');
    expect(byTitle['Gut zu wissen']!.paragraphs[0]).toMatch(/Gruppenletzter/);
    expect(byTitle['Weiterkommen']!.items).toHaveLength(4);
    expect(byTitle['Weiterkommen']!.items!.join(' ')).toMatch(/A1 – [BCD]2/);
    expect(byTitle['Platzierungen']!.items).toEqual([
      'Finale: Sieger Platz 1, Verlierer Platz 2',
      'Halbfinale: Verlierer gemeinsam Platz 3–4',
      'Viertelfinale: Verlierer gemeinsam Platz 5–8',
      'Alle 3. der Gruppen: gemeinsam Platz 9–12',
      'Alle 4. der Gruppen: gemeinsam Platz 13–16',
    ]);
  });

  it('shows byes in the pairings and places with a match for 3rd place', () => {
    const sections = competitionRules(translator('en'), {
      format: { groups: { groupCount: 3 }, knockout: { qualifiersPerGroup: 2, placements: 'thirdPlace' } },
      matchRules: rules,
      ranking: tableTennis.ranking,
      entryCount: 12,
      drawn: true,
    });
    const advance = sections.find((s) => s.title === 'Advancing')!;
    expect(advance.items).toContain('A1 – bye');
    expect(advance.items).toContain('B1 – bye');
    const places = sections.find((s) => s.title === 'Places')!.items!;
    expect(places.slice(0, 3)).toEqual([
      'Final: winner place 1, loser place 2',
      'Match for place 3: winner place 3, loser place 4',
      'Quarterfinal: losers share place 5–6',
    ]);
  });

  it('a single round robin: the table position is the place', () => {
    const sections = competitionRules(translator('de'), {
      format: { groups: { groupCount: 1 } },
      matchRules: rules,
      ranking: tableTennis.ranking,
      entryCount: 5,
      drawn: false,
    });
    expect(sections[0]!.paragraphs[1]).toMatch(/^Noch nicht ausgelost/);
    expect(sections.find((s) => s.title === 'Platzierungen')!.items).toEqual(['Der Tabellenplatz ist die Platzierung.']);
    expect(sections.some((s) => s.title === 'Weiterkommen')).toBe(false);
  });

  it('a knockout without groups mentions the seeded draw', () => {
    const sections = competitionRules(translator('de'), {
      format: { knockout: { placements: 'all' } },
      matchRules: rules,
      ranking: tableTennis.ranking,
      entryCount: 8,
      drawn: true,
    });
    expect(sections.find((s) => s.title === 'Weiterkommen')!.paragraphs[0]).toMatch(/nach Setzliste ausgelost/);
    expect(sections.find((s) => s.title === 'Platzierungen')!.items).toHaveLength(4);
  });
});
