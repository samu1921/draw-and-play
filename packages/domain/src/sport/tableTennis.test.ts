import { describe, expect, it } from 'vitest';
import { tableTennis } from './tableTennis.js';
import { matchOutcome, validateGame } from './rules.js';

const bestOf5 = tableTennis.defaultMatchRules;
const bestOf3 = { ...bestOf5, gamesToWin: 2 };

describe('table tennis: game rules', () => {
  it.each([
    [11, 4, 0],
    [4, 11, 1],
    [11, 9, 0],
    [12, 10, 0],
    [13, 15, 1],
    [11, 0, 0],
  ] as const)('%i:%i is valid, won by side %i', (a, b, winner) => {
    expect(validateGame([a, b], bestOf5)).toEqual({ ok: true, winner });
  });

  it.each([
    [11, 10, 'leadTooSmall'],
    [10, 8, 'gameNotFinished'],
    [12, 9, 'impossibleScore'],
    [14, 10, 'impossibleScore'],
    [11, 11, 'noWinner'],
    [-1, 11, 'invalidScore'],
  ] as const)('%i:%i is invalid (%s)', (a, b, error) => {
    expect(validateGame([a, b], bestOf5)).toEqual({ ok: false, error });
  });

  it('respects a point cap (badminton-style rules)', () => {
    const badminton = { gamesToWin: 2, pointsPerGame: 21, winBy: 2, pointCap: 30 };
    expect(validateGame([30, 29], badminton)).toEqual({ ok: true, winner: 0 });
    expect(validateGame([31, 29], badminton)).toEqual({ ok: false, error: 'aboveCap' });
  });
});

describe('table tennis: short notation', () => {
  const parse = (input: string, rules = bestOf5) => tableTennis.parseResult(input, rules);

  it('"4" means 11:4, "-5" means 5:11, "-13" means 13:15', () => {
    const r = parse('4 -5 -13 7 9');
    expect(r.ok && r.games).toEqual([
      [11, 4],
      [5, 11],
      [13, 15],
      [11, 7],
      [11, 9],
    ]);
    expect(r.ok && r.outcome).toEqual({ status: 'finished', winner: 0, games: [3, 2] });
  });

  it('"0" and "-0" are 11:0 and 0:11, "10" means 12:10', () => {
    const r = parse('0,-0,10,-9,3');
    expect(r.ok && r.games).toEqual([
      [11, 0],
      [0, 11],
      [12, 10],
      [9, 11],
      [11, 3],
    ]);
  });

  it('accepts commas, semicolons and repeated spaces', () => {
    const r = parse(' 4;  -5 ,6  8 ');
    expect(r.ok && r.outcome).toEqual({ status: 'finished', winner: 0, games: [3, 1] });
  });

  it('accepts full game scores such as 11:4 or 13-11', () => {
    const r = parse('11:4 9:11 13-11 11:2');
    expect(r.ok && r.games).toEqual([
      [11, 4],
      [9, 11],
      [13, 11],
      [11, 2],
    ]);
  });

  it('recognises a match in progress (live score)', () => {
    expect(parse('4 -5')).toMatchObject({ ok: true, outcome: { status: 'inProgress', games: [1, 1] } });
  });

  it('finds the winner with 2 games to win', () => {
    expect(parse('-3 -7', bestOf3)).toMatchObject({ ok: true, outcome: { status: 'finished', winner: 1, games: [0, 2] } });
  });

  it('rejects games after the match is over', () => {
    expect(parse('1 2 3 4')).toEqual({ ok: false, error: { code: 'gameAfterMatchEnd', token: '4' } });
  });

  it('rejects invalid input with an error code', () => {
    expect(parse('abc')).toEqual({ ok: false, error: { code: 'invalidToken', token: 'abc' } });
    expect(parse('4.5')).toEqual({ ok: false, error: { code: 'invalidToken', token: '4.5' } });
    expect(parse('11:10')).toEqual({ ok: false, error: { code: 'invalidGame', token: '11:10', reason: 'leadTooSmall' } });
    expect(parse('')).toEqual({ ok: false, error: { code: 'empty' } });
  });
});

describe('matchOutcome', () => {
  it('counts games and finds the winner', () => {
    expect(
      matchOutcome(
        [
          [11, 4],
          [11, 5],
          [11, 6],
        ],
        bestOf5,
      ),
    ).toEqual({ status: 'finished', winner: 0, games: [3, 0] });
  });
});

describe('table tennis: duration estimate', () => {
  it('best of 5 ≈ 30 min, best of 3 ≈ 20 min', () => {
    expect(tableTennis.estimateMatchMinutes(bestOf5)).toBe(30);
    expect(tableTennis.estimateMatchMinutes(bestOf3)).toBe(20);
  });
});
