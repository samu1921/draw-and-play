import { describe, expect, it } from 'vitest';
import {
  buildKnockout,
  knockoutRoundName,
  knockoutPlacements,
  resolveKnockout,
  type KnockoutMatch,
} from './knockout.js';

/** Compact round names for assertions: R8 = quarterfinal, R2 = final, P3 = match for 3rd place, P5-8 = placement round */
const labels = (matches: KnockoutMatch[]) =>
  matches.map((m) => {
    const name = knockoutRoundName(m);
    if (name.type === 'main') return `R${name.size}`;
    return name.type === 'placementMatch' ? `P${name.place}` : `P${name.from}-${name.to}`;
  });

describe('buildKnockout', () => {
  it('bracket of 8 without placement matches: 4 + 2 + 1 matches', () => {
    const ko = buildKnockout(8, { playOutPlaces: 2 });
    expect(ko.matches).toHaveLength(7);
    expect(labels(ko.matches)).toEqual([
      'R8',
      'R8',
      'R8',
      'R8',
      'R4',
      'R4',
      'R2',
    ]);
  });

  it('with a match for 3rd place', () => {
    const ko = buildKnockout(4, { playOutPlaces: 4 });
    expect(labels(ko.matches)).toEqual(['R4', 'R4', 'R2', 'P3']);
    const third = ko.matches.at(-1)!;
    expect(third.sides).toEqual([
      { type: 'loser', match: ko.matches[0]!.id },
      { type: 'loser', match: ko.matches[1]!.id },
    ]);
  });

  it('all places played out: everyone plays the same number of rounds', () => {
    const ko = buildKnockout(8, { playOutPlaces: 8 });
    // 3 rounds of 4 matches: quarterfinals, semifinals + places 5–8, final + places 3/5/7
    expect(ko.matches).toHaveLength(12);
    expect(labels(ko.matches.filter((m) => m.round === 3))).toEqual([
      'R2',
      'P3',
      'P5',
      'P7',
    ]);
    expect(labels(ko.matches.filter((m) => m.round === 2))).toEqual([
      'R4',
      'R4',
      'P5-8',
      'P5-8',
    ]);
  });

  it('bracket of 16 with places 1–8: round-of-16 losers are out', () => {
    const ko = buildKnockout(16, { playOutPlaces: 8 });
    expect(ko.matches).toHaveLength(8 + 4 + 2 + 2 + 1 + 1 + 1 + 1);
    expect(ko.matches.some((m) => m.places[0] === 9)).toBe(false);
  });

  it('matches are ordered by round and place range and numbered consecutively', () => {
    const ko = buildKnockout(8, { playOutPlaces: 8 });
    expect(ko.matches.map((m) => m.number)).toEqual(ko.matches.map((_, i) => i + 1));
    const rounds = ko.matches.map((m) => m.round);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
  });
});

describe('resolveKnockout', () => {
  it('decides byes automatically and advances winners', () => {
    const ko = buildKnockout(4, { playOutPlaces: 4 });
    const [sf1, sf2, final, third] = ko.matches;
    const r = resolveKnockout(ko, ['A', null, 'B', 'C'], new Map());
    expect(r.get(sf1!.id)).toMatchObject({ status: 'bye', winner: 'A' });
    expect(r.get(sf2!.id)).toMatchObject({ status: 'ready', sides: ['B', 'C'] });
    expect(r.get(final!.id)).toMatchObject({ status: 'pending', sides: ['A', null] });
    // The loser of the bye match is the bye → the semifinal-2 loser gets 3rd place without playing
    expect(r.get(third!.id)).toMatchObject({ status: 'pending', sides: ['bye', null] });

    const after = resolveKnockout(ko, ['A', null, 'B', 'C'], new Map([[sf2!.id, 1]]));
    expect(after.get(final!.id)).toMatchObject({ status: 'ready', sides: ['A', 'C'] });
    expect(after.get(third!.id)).toMatchObject({ status: 'bye', winner: 'B' });
  });

  it('two byes against each other produce a bye again', () => {
    const ko = buildKnockout(8, { playOutPlaces: 8 });
    // 6 entries: byes for seeds 1 and 2 → the match for 7th place is bye vs bye
    const seats = ['S1', null, 'S5', 'S4', 'S3', 'S6', null, 'S2'];
    const r = resolveKnockout(ko, seats, new Map());
    const p78 = ko.matches.find((m) => m.places[0] === 7)!;
    expect(r.get(p78.id)).toMatchObject({ status: 'bye', winner: 'bye', loser: 'bye' });
  });
});

describe('knockoutPlacements', () => {
  it('assigns places 1–4 after the final and the match for 3rd place', () => {
    const ko = buildKnockout(4, { playOutPlaces: 4 });
    const [sf1, sf2, final, third] = ko.matches;
    const results = new Map([
      [sf1!.id, 0],
      [sf2!.id, 1],
      [final!.id, 1],
      [third!.id, 0],
    ] as const);
    const r = resolveKnockout(ko, ['A', 'B', 'C', 'D'], results);
    expect(knockoutPlacements(ko, r)).toEqual([
      { entryId: 'D', place: 1, placeTo: 1 },
      { entryId: 'A', place: 2, placeTo: 2 },
      { entryId: 'B', place: 3, placeTo: 3 },
      { entryId: 'C', place: 4, placeTo: 4 },
    ]);
  });

  it('without placement matches the semifinal losers share 3rd place', () => {
    const ko = buildKnockout(4, { playOutPlaces: 2 });
    const [sf1, sf2, final] = ko.matches;
    const results = new Map([
      [sf1!.id, 0],
      [sf2!.id, 0],
      [final!.id, 0],
    ] as const);
    const r = resolveKnockout(ko, ['A', 'B', 'C', 'D'], results);
    expect(knockoutPlacements(ko, r)).toEqual([
      { entryId: 'A', place: 1, placeTo: 1 },
      { entryId: 'C', place: 2, placeTo: 2 },
      { entryId: 'B', place: 3, placeTo: 4 },
      { entryId: 'D', place: 3, placeTo: 4 },
    ]);
  });

  it('places have no gaps when the bracket contains byes', () => {
    const ko = buildKnockout(8, { playOutPlaces: 8 });
    const seats = ['S1', null, 'S5', 'S4', 'S3', 'S6', null, 'S2'];
    // First side always wins
    const results = new Map<string, 0 | 1>();
    for (let i = 0; i < 4; i++) {
      for (const m of ko.matches) {
        const res = resolveKnockout(ko, seats, results).get(m.id)!;
        if (res.status === 'ready') results.set(m.id, 0);
      }
    }
    const placements = knockoutPlacements(ko, resolveKnockout(ko, seats, results));
    expect(placements.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
