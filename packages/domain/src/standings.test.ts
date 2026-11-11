import { describe, expect, it } from 'vitest';
import { tableTennis } from './sport/tableTennis.js';
import { computeStandings, explainStandings, type StandingsMatch } from './standings.js';
import type { GameScore } from './sport/types.js';

const tt = tableTennis.ranking;

/** Match with games from a's point of view, e.g. m('A', 'B', '4 5 6') */
function m(a: string, b: string, notation: string): StandingsMatch {
  const parsed = tableTennis.parseResult(notation, tableTennis.defaultMatchRules);
  if (!parsed.ok || parsed.outcome.status !== 'finished') throw new Error(`test data: ${notation}`);
  return { a, b, result: { winner: parsed.outcome.winner, games: parsed.games } };
}

const order = (rows: { entryId: string }[]) => rows.map((r) => r.entryId);

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

  it('game difference breaks a tie on wins', () => {
    const rows = computeStandings(
      ['A', 'B', 'C'],
      [m('A', 'B', '1 1 1'), m('B', 'C', '1 1 -1 1'), m('C', 'A', '1 1 -1 -1 1')],
      tt,
    );
    // A: 3:0 and 2:3 → 5:3 (+2); B: 0:3 and 3:1 → 3:4 (−1); C: 1:3 and 3:2 → 4:5 (−1)
    // B and C level (−1), head-to-head B–C: B wins
    expect(order(rows)).toEqual(['A', 'B', 'C']);
  });

  it('head-to-head comes before points when wins and games are level', () => {
    // A and B: 2 wins each, games 6:3. A has the better point difference, B won the duel.
    // C and D: 1 win each, games 3:6. D won the duel.
    const rows = computeStandings(
      ['A', 'B', 'C', 'D'],
      [
        m('B', 'A', '9 9 9'),
        m('A', 'C', '0 0 0'),
        m('A', 'D', '0 0 0'),
        m('C', 'B', '9 9 9'),
        m('B', 'D', '9 9 9'),
        m('D', 'C', '0 0 0'),
      ],
      tt,
    );
    expect(order(rows)).toEqual(['B', 'A', 'D', 'C']);
  });

  it('falls back to the draw order when everything is level', () => {
    const rows = computeStandings(
      ['A', 'B', 'C', 'D'],
      [
        m('A', 'B', '1 1 1'),
        m('A', 'C', '1 1 1'),
        m('A', 'D', '1 1 1'),
        m('C', 'B', '1 1 1'),
        m('B', 'D', '1 1 1'),
        m('D', 'C', '1 1 1'),
      ],
      tt,
    );
    // B, C, D: 1 win each, games 3:6, cyclic duels, every game 11:1 → identical points too
    expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('head-to-head: the winner of the duel is ahead even with fewer points in it', () => {
    // A and B: 2 wins each, games 6:4 and 7:5 (+2 each). A won the duel 3:1, but with fewer points in it (33:38).
    const rows = computeStandings(
      ['B', 'A', 'C', 'D'],
      [
        m('A', 'B', '9 9 -0 9'),
        m('A', 'C', '1 1 1'),
        m('D', 'A', '1 1 1'),
        m('B', 'C', '1 1 1'),
        m('B', 'D', '1 1 -1 -1 1'),
        m('C', 'D', '1 1 1'),
      ],
      tt,
    );
    expect(order(rows).slice(0, 2)).toEqual(['A', 'B']);
  });

  it('three-way tie with cyclic duels: points among the tied entries decide', () => {
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
    // B, C, D: 1 win each and 3:6 games → mini table cyclic (B>C, C>D, D>B) → points in the mini table
    // B–C 33:27, D–B 33:27, C–D 33:3: C: 27+33=60:36, D: 3+33=36:60, B: 33+27=60:60
    expect(order(rows)).toEqual(['A', 'C', 'B', 'D']);
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

  it('supports game ratio for other sports', () => {
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

  it('shows game difference first, then the duel of the entries still level', () => {
    const matches = [m('A', 'B', '1 1 1'), m('B', 'C', '1 1 -1 1'), m('C', 'A', '1 1 -1 -1 1')];
    const { rows, tieBreaks } = explainStandings(['A', 'B', 'C'], matches, tt);
    expect(order(rows)).toEqual(['A', 'B', 'C']);
    expect(tieBreaks).toEqual([
      {
        criterion: 'matchPoints',
        entries: ['A', 'B', 'C'],
        scores: [[1, 1], [1, 1], [1, 1]],
        steps: [
          { type: 'criterion', criterion: 'gameDiff', entries: ['A', 'B', 'C'], scores: [[5, 3], [3, 4], [4, 5]], classes: [['A'], ['B', 'C']] },
          { type: 'headToHead', entries: ['B', 'C'], skipped: false },
          { type: 'criterion', criterion: 'matchPoints', entries: ['B', 'C'], scores: [[1, 0], [0, 1]], classes: [['B'], ['C']], among: ['B', 'C'] },
        ],
      },
    ]);
  });

  it('skips the duel when the tied entries are the whole group', () => {
    // Cyclic: everyone 1:1 wins and 3:3 games, points decide
    // A 45:36, B 36:39, C 39:45
    const matches = [m('A', 'B', '1 1 1'), m('B', 'C', '2 2 2'), m('C', 'A', '4 4 4')];
    const { rows, tieBreaks } = explainStandings(['A', 'B', 'C'], matches, tt);
    const steps = tieBreaks[0]!.steps;
    expect(steps.map((s) => s.type)).toEqual(['criterion', 'headToHead', 'criterion']);
    expect(steps[1]).toEqual({ type: 'headToHead', entries: order(rows), skipped: true });
    expect(steps[2]).toMatchObject({ criterion: 'pointDiff', entries: order(rows) });
  });

  it('separates in the mini table by points when the duels are cyclic', () => {
    const matches = [
      m('A', 'B', '1 1 1'),
      m('A', 'C', '1 1 1'),
      m('A', 'D', '1 1 1'),
      m('B', 'C', '9 9 9'),
      m('D', 'B', '9 9 9'),
      m('C', 'D', '1 1 1'),
    ];
    const { tieBreaks } = explainStandings(['A', 'B', 'C', 'D'], matches, tt);
    expect(tieBreaks).toHaveLength(1);
    expect(tieBreaks[0]!.entries).toEqual(['C', 'B', 'D']);
    expect(tieBreaks[0]!.steps).toEqual([
      { type: 'criterion', criterion: 'gameDiff', entries: ['C', 'B', 'D'], scores: [[3, 6], [3, 6], [3, 6]], classes: [['C', 'B', 'D']] },
      { type: 'headToHead', entries: ['C', 'B', 'D'], skipped: false },
      { type: 'criterion', criterion: 'matchPoints', entries: ['C', 'B', 'D'], scores: [[1, 1], [1, 1], [1, 1]], classes: [['C', 'B', 'D']], among: ['B', 'C', 'D'] },
      { type: 'criterion', criterion: 'gameDiff', entries: ['C', 'B', 'D'], scores: [[3, 3], [3, 3], [3, 3]], classes: [['C', 'B', 'D']], among: ['B', 'C', 'D'] },
      {
        type: 'criterion',
        criterion: 'pointDiff',
        entries: ['C', 'B', 'D'],
        scores: [[60, 36], [60, 60], [36, 60]],
        classes: [['C'], ['B'], ['D']],
        among: ['B', 'C', 'D'],
      },
    ]);
  });

  it('ends with the draw order when nothing separates', () => {
    const matches = [
      m('A', 'B', '1 1 1'),
      m('A', 'C', '1 1 1'),
      m('A', 'D', '1 1 1'),
      m('C', 'B', '1 1 1'),
      m('B', 'D', '1 1 1'),
      m('D', 'C', '1 1 1'),
    ];
    const { tieBreaks } = explainStandings(['A', 'B', 'C', 'D'], matches, tt);
    expect(tieBreaks[0]!.steps.at(-1)).toEqual({ type: 'drawOrder', entries: ['B', 'C', 'D'] });
  });

  it('lists several ties from the top of the table down', () => {
    // A, B: 2 wins; C, D: 1 win (same data as the head-to-head test above)
    const matches = [
      m('B', 'A', '9 9 9'),
      m('A', 'C', '0 0 0'),
      m('A', 'D', '0 0 0'),
      m('C', 'B', '9 9 9'),
      m('B', 'D', '9 9 9'),
      m('D', 'C', '0 0 0'),
    ];
    const { tieBreaks } = explainStandings(['A', 'B', 'C', 'D'], matches, tt);
    expect(tieBreaks.map((t) => t.entries)).toEqual([
      ['B', 'A'],
      ['D', 'C'],
    ]);
  });

  it('orders exactly like computeStandings', () => {
    const entries = ['A', 'B', 'C', 'D', 'E'];
    const notations = ['1 1 1', '-1 -1 -1', '5 -5 5 -5 5', '-9 9 -9 9 -9', '3 3 -3 3'];
    const pairs = entries.flatMap((a, i) => entries.slice(i + 1).map((b) => [a, b] as const));
    for (let seed = 0; seed < 50; seed++) {
      const matches = pairs.map(([a, b], i) => m(a, b, notations[(i * 7 + seed * 3 + (seed >> 2)) % notations.length]!));
      const { rows } = explainStandings(entries, matches, tt);
      expect(rows).toEqual(computeStandings(entries, matches, tt));
      const { tieBreaks } = explainStandings(entries, matches, tt);
      for (const tie of tieBreaks) {
        const ranks = tie.entries.map((id) => order(rows).indexOf(id));
        expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
      }
    }
  });
});
