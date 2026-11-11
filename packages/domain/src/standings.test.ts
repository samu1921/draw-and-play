import { describe, expect, it } from 'vitest';
import { tableTennis } from './sport/tableTennis.js';
import { computeStandings, explainStandings, type StandingsMatch } from './standings.js';
import type { GameScore } from './sport/types.js';

/** Table tennis after DTTB WO D 7.5; without a lot seed the draw order stands in for the lot */
const tt = tableTennis.ranking;

/** Match with games from a's point of view, e.g. m('A', 'B', '4 5 6') */
function m(a: string, b: string, notation: string): StandingsMatch {
  const parsed = tableTennis.parseResult(notation, tableTennis.defaultMatchRules);
  if (!parsed.ok || parsed.outcome.status !== 'finished') throw new Error(`test data: ${notation}`);
  return { a, b, result: { winner: parsed.outcome.winner, games: parsed.games } };
}

const order = (rows: { entryId: string }[]) => rows.map((r) => r.entryId);

// A, B, C: one win each. Games A 5:3, B 3:4, C 4:5. Points B 37:47 and C 49:59 (both −10). B beat C.
const gamesThenDuel = [m('A', 'B', '1 1 1'), m('B', 'C', '1 1 -1 1'), m('C', 'A', '1 1 -1 -1 1')];

// A and B: 2 wins, games 6:3 each; A has the better points (+60 against +6), B won the duel.
// C and D: 1 win, games 3:6 each; D has the better points (−6 against −60), C won the duel.
const pointsBeforeDuel = [
  m('B', 'A', '9 9 9'),
  m('A', 'C', '0 0 0'),
  m('A', 'D', '0 0 0'),
  m('C', 'B', '9 9 9'),
  m('B', 'D', '9 9 9'),
  m('D', 'C', '0 0 0'),
];

// A and B: record 2:1, games 6:4 and 7:5 (+2), points 81:86 and 104:109 (−5): only the duel is left.
// A won it 3:1, but with fewer points in it (33:38).
const duelOnly = [
  m('A', 'B', '9 9 -0 9'),
  m('A', 'C', '5 5 5'),
  m('D', 'A', '5 5 5'),
  m('B', 'C', '9 9 9'),
  m('B', 'D', '9 9 -0 -0 9'),
  m('C', 'D', '1 1 1'),
];

// B, C and D: one win each, every game 11:1, cyclic duels: level on everything, also among themselves.
const allLevel = [
  m('A', 'B', '1 1 1'),
  m('A', 'C', '1 1 1'),
  m('A', 'D', '1 1 1'),
  m('C', 'B', '1 1 1'),
  m('B', 'D', '1 1 1'),
  m('D', 'C', '1 1 1'),
];

describe('computeStandings', () => {
  it('counts matches, games and points', () => {
    const rows = computeStandings(['A', 'B'], [m('A', 'B', '4 -5 6 7')], tt);
    expect(rows[0]).toEqual({
      entryId: 'A',
      rank: 1,
      played: 1,
      won: 1,
      lost: 0,
      matchPoints: 1,
      gamesWon: 3,
      gamesLost: 1,
      pointsWon: 11 + 5 + 11 + 11,
      pointsLost: 4 + 11 + 6 + 7,
    });
    expect(rows[1]).toMatchObject({ entryId: 'B', rank: 2, won: 0, lost: 1, gamesWon: 1, gamesLost: 3 });
  });

  it('orders by wins first', () => {
    const rows = computeStandings(
      ['A', 'B', 'C'],
      [m('A', 'B', '-1 -1 -1'), m('A', 'C', '-1 -1 -1'), m('B', 'C', '1 1 1')],
      tt,
    );
    expect(order(rows)).toEqual(['B', 'C', 'A']);
  });

  it('with equal wins, fewer losses are ahead (group still running)', () => {
    // A 2:0, B 2:1 – B has the better game difference, but one loss more
    const rows = computeStandings(
      ['B', 'A', 'C', 'D', 'E'],
      [m('A', 'C', '9 9 9'), m('A', 'D', '9 9 9'), m('B', 'C', '1 1 1'), m('B', 'D', '1 1 1'), m('E', 'B', '9 9 9')],
      tt,
    );
    expect(order(rows).slice(0, 2)).toEqual(['A', 'B']);
  });

  it('game difference of all matches, then point difference, then the duel', () => {
    expect(order(computeStandings(['A', 'B', 'C'], gamesThenDuel, tt))).toEqual(['A', 'B', 'C']);
  });

  it('point difference of all matches comes before the duel', () => {
    expect(order(computeStandings(['A', 'B', 'C', 'D'], pointsBeforeDuel, tt))).toEqual(['A', 'B', 'D', 'C']);
  });

  it('the duel is decided by its winner first, not by the points in it', () => {
    expect(order(computeStandings(['B', 'A', 'C', 'D'], duelOnly, tt)).slice(0, 2)).toEqual(['A', 'B']);
  });

  it('three-way tie with cyclic duels: the point difference of all matches decides', () => {
    const rows = computeStandings(
      ['A', 'B', 'C', 'D'],
      [
        m('A', 'B', '1 1 1'),
        m('A', 'C', '1 1 1'),
        m('A', 'D', '1 1 1'),
        m('B', 'C', '9 9 9'),
        m('D', 'B', '9 9 9'),
        m('C', 'D', '1 1 1'),
      ],
      tt,
    );
    // B 63:93 (−30), C 63:69 (−6), D 39:93 (−54)
    expect(order(rows)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('falls back to the draw order without a lot seed', () => {
    expect(order(computeStandings(['A', 'B', 'C', 'D'], allLevel, tt))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('draws lots reproducibly when everything is level', () => {
    const orders = Array.from({ length: 20 }, (_, seed) => order(computeStandings(['A', 'B', 'C', 'D'], allLevel, tt, { lotSeed: seed })));
    // Same seed, same lot
    expect(order(computeStandings(['A', 'B', 'C', 'D'], allLevel, tt, { lotSeed: 3 }))).toEqual(orders[3]);
    // A is ahead on wins regardless of the lot; B, C and D are drawn
    expect(orders.every((o) => o[0] === 'A' && [...o.slice(1)].sort().join() === 'B,C,D')).toBe(true);
    expect(new Set(orders.map((o) => o.join())).size).toBeGreaterThan(1);
  });

  it('counts a walkover as a win without games and points', () => {
    const rows = computeStandings(
      ['A', 'B'],
      [{ a: 'A', b: 'B', result: { winner: 1, games: [] as GameScore[], walkover: true } }],
      tt,
    );
    expect(rows[0]).toMatchObject({ entryId: 'B', won: 1, gamesWon: 0, pointsWon: 0 });
    expect(rows[1]).toMatchObject({ entryId: 'A', lost: 1 });
  });

  it('keeps the draw order before any match is played', () => {
    expect(order(computeStandings(['C', 'A', 'B'], [], tt))).toEqual(['C', 'A', 'B']);
  });

  it('supports plain criteria lists and game ratio for other sports', () => {
    // Group in progress, 2 wins each. A: games 6:2 (+4, ratio 3.0); B: games 8:3 (+5, ratio 2.67)
    const matches = [
      m('A', 'X', '1 1 -1 1'),
      m('A', 'Y', '1 1 -1 1'),
      m('B', 'X', '1 1 1'),
      m('B', 'Y', '1 1 1'),
      m('Z', 'B', '1 -1 1 -1 1'),
    ];
    const entries = ['A', 'B', 'X', 'Y', 'Z'];
    expect(order(computeStandings(entries, matches, ['matchPoints', 'gameDiff'])).slice(0, 2)).toEqual(['B', 'A']);
    expect(order(computeStandings(entries, matches, ['matchPoints', 'gameRatio'])).slice(0, 2)).toEqual(['A', 'B']);
  });
});

describe('explainStandings', () => {
  it('has no tie-breaks when the wins decide everything', () => {
    const { tieBreaks } = explainStandings(['A', 'B'], [m('A', 'B', '1 1 1')], tt);
    expect(tieBreaks).toEqual([]);
  });

  it('shows game difference, point difference and then the duel of those still level', () => {
    const { rows, tieBreaks } = explainStandings(['A', 'B', 'C'], gamesThenDuel, tt);
    expect(order(rows)).toEqual(['A', 'B', 'C']);
    expect(tieBreaks).toEqual([
      {
        criterion: 'record',
        entries: ['A', 'B', 'C'],
        scores: [[1, 1], [1, 1], [1, 1]],
        steps: [
          { type: 'criterion', criterion: 'gameDiff', entries: ['A', 'B', 'C'], scores: [[5, 3], [3, 4], [4, 5]], classes: [['A'], ['B', 'C']] },
          { type: 'criterion', criterion: 'pointDiff', entries: ['B', 'C'], scores: [[37, 47], [49, 59]], classes: [['B', 'C']] },
          { type: 'headToHead', entries: ['B', 'C'], skipped: false },
          { type: 'criterion', criterion: 'matchDiff', entries: ['B', 'C'], scores: [[1, 0], [0, 1]], classes: [['B'], ['C']], among: ['B', 'C'] },
        ],
      },
    ]);
  });

  it('the duel comes last and counts its winner before its points', () => {
    const { tieBreaks } = explainStandings(['B', 'A', 'C', 'D'], duelOnly, tt);
    expect(tieBreaks[0]!.steps).toEqual([
      { type: 'criterion', criterion: 'gameDiff', entries: ['A', 'B'], scores: [[6, 4], [7, 5]], classes: [['A', 'B']] },
      { type: 'criterion', criterion: 'pointDiff', entries: ['A', 'B'], scores: [[81, 86], [104, 109]], classes: [['A', 'B']] },
      { type: 'headToHead', entries: ['A', 'B'], skipped: false },
      { type: 'criterion', criterion: 'matchDiff', entries: ['A', 'B'], scores: [[1, 0], [0, 1]], classes: [['A'], ['B']], among: ['B', 'A'] },
    ]);
  });

  it('skips the duel when the tied entries are the whole group', () => {
    // Cyclic, every game 11:1: everyone 1:1 wins, 3:3 games, 36:36 points
    const matches = [m('A', 'B', '1 1 1'), m('B', 'C', '1 1 1'), m('C', 'A', '1 1 1')];
    const steps = explainStandings(['A', 'B', 'C'], matches, tt).tieBreaks[0]!.steps;
    expect(steps.map((s) => s.type)).toEqual(['criterion', 'criterion', 'headToHead', 'drawOrder']);
    expect(steps[2]).toEqual({ type: 'headToHead', entries: ['A', 'B', 'C'], skipped: true });
  });

  it('ends with the draw order, or with the lot when there is a seed', () => {
    const plain = explainStandings(['A', 'B', 'C', 'D'], allLevel, tt).tieBreaks[0]!;
    expect(plain.steps.map((s) => (s.type === 'criterion' ? `${s.criterion}${s.among ? '*' : ''}` : s.type))).toEqual([
      'gameDiff',
      'pointDiff',
      'headToHead',
      'matchDiff*',
      'gameDiff*',
      'pointDiff*',
      'drawOrder',
    ]);
    expect(plain.steps.at(-1)).toEqual({ type: 'drawOrder', entries: ['B', 'C', 'D'] });

    const drawn = explainStandings(['A', 'B', 'C', 'D'], allLevel, tt, { lotSeed: 'x' });
    const lot = drawn.tieBreaks[0]!.steps.at(-1)!;
    expect(lot.type).toBe('lot');
    expect(lot.entries).toEqual(order(drawn.rows).slice(1));
  });

  it('lists several ties from the top of the table down', () => {
    const { tieBreaks } = explainStandings(['A', 'B', 'C', 'D'], pointsBeforeDuel, tt);
    expect(tieBreaks.map((t) => t.entries)).toEqual([
      ['A', 'B'],
      ['D', 'C'],
    ]);
  });

  it('orders exactly like computeStandings', () => {
    const entries = ['A', 'B', 'C', 'D', 'E'];
    const notations = ['1 1 1', '-1 -1 -1', '5 -5 5 -5 5', '-9 9 -9 9 -9', '3 3 -3 3'];
    const pairs = entries.flatMap((a, i) => entries.slice(i + 1).map((b) => [a, b] as const));
    for (let seed = 0; seed < 50; seed++) {
      const matches = pairs.map(([a, b], i) => m(a, b, notations[(i * 7 + seed * 3 + (seed >> 2)) % notations.length]!));
      const { rows, tieBreaks } = explainStandings(entries, matches, tt, { lotSeed: seed });
      expect(rows).toEqual(computeStandings(entries, matches, tt, { lotSeed: seed }));
      for (const tie of tieBreaks) {
        const ranks = tie.entries.map((id) => order(rows).indexOf(id));
        expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
      }
    }
  });
});
