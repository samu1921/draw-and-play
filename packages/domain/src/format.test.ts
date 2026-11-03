import { describe, expect, it } from 'vitest';
import { buildStructure, validateFormat, type CompetitionFormat } from './format.js';

const roundRobin: CompetitionFormat = { groups: { groupCount: 1 } };
const groupsKo = (groupCount: number, qualifiersPerGroup: number, placements: 'none' | 'thirdPlace' | 'all' = 'none'): CompetitionFormat => ({
  groups: { groupCount },
  knockout: { qualifiersPerGroup, placements },
});

describe('validateFormat', () => {
  it('accepts sensible formats', () => {
    expect(validateFormat(roundRobin, 5)).toBeNull();
    expect(validateFormat(groupsKo(1, 4), 4)).toBeNull();
    expect(validateFormat(groupsKo(3, 2), 10)).toBeNull();
    expect(validateFormat({ knockout: { placements: 'none' } }, 6)).toBeNull();
  });

  it('rejects impossible formats with a code', () => {
    expect(validateFormat(roundRobin, 1)).toBe('tooFewEntries');
    expect(validateFormat(groupsKo(4, 1), 7)).toBe('groupsTooSmall');
    expect(validateFormat(groupsKo(2, 4), 6)).toBe('tooManyQualifiers');
    expect(validateFormat({}, 6)).toBe('noStages');
    expect(validateFormat({ groups: { groupCount: 2 }, knockout: { placements: 'none' } }, 8)).toBe('missingQualifiers');
  });
});

describe('buildStructure', () => {
  it('round robin with 5 entries: 10 matches in 5 rounds, 4 per entry', () => {
    const s = buildStructure(roundRobin, 5);
    expect(s.groupSizes).toEqual([5]);
    expect(s.matches).toHaveLength(10);
    expect(Math.max(...s.matches.map((m) => m.round))).toBe(5);
    expect(s.knockout).toBeUndefined();
    expect(s.matchesPerEntry).toEqual({ min: 4, max: 4 });
  });

  it('lists group matches round by round across groups', () => {
    const s = buildStructure(groupsKo(2, 2), 8);
    const groupMatches = s.matches.filter((m) => m.phase === 'group');
    const rounds = groupMatches.map((m) => m.round);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
    expect(groupMatches[0]!.sides).toEqual([
      { type: 'groupSeat', group: 0, position: 0 },
      { type: 'groupSeat', group: 0, position: 3 },
    ]);
  });

  // Concept 3.3 lists 2–5 here, but the runner-up of the group of 4 has no bye: 3 group matches + 3 knockout = 6.
  it('10 entries, 3 groups (4/3/3), top 2 → bracket of 8 with 2 byes: 17 matches, 2–6 per entry', () => {
    const s = buildStructure(groupsKo(3, 2), 10);
    expect(s.groupSizes).toEqual([4, 3, 3]);
    expect(s.knockout!.bracket.size).toBe(8);
    expect(s.knockout!.byes).toBe(2);
    expect(s.matches).toHaveLength(12 + 5);
    expect(s.matchesPerEntry).toEqual({ min: 2, max: 6 });
  });

  it('10 entries, 2 × 5, top 2 with 3rd place: 24 matches, 4–6 per entry', () => {
    const s = buildStructure(groupsKo(2, 2, 'thirdPlace'), 10);
    expect(s.matches).toHaveLength(20 + 4);
    expect(s.matchesPerEntry).toEqual({ min: 4, max: 6 });
  });

  it('16 entries, 3 × (6/5/5), top 2 → 40 matches, 4–8 per entry', () => {
    const s = buildStructure(groupsKo(3, 2), 16);
    expect(s.matches).toHaveLength(40);
    expect(s.matchesPerEntry).toEqual({ min: 4, max: 8 });
  });

  it('knockout matches wait for the whole group stage by default', () => {
    const s = buildStructure(groupsKo(2, 2), 8);
    const groupIds = s.matches.filter((m) => m.phase === 'group').map((m) => m.id);
    const semis = s.matches.filter((m) => m.phase === 'knockout' && m.round === 1);
    for (const semi of semis) expect([...semi.dependsOn].sort()).toEqual([...groupIds].sort());
    const final = s.matches.find((m) => m.phase === 'knockout' && m.round === 2)!;
    expect([...final.dependsOn].sort()).toEqual(semis.map((m) => m.id).sort());
  });

  it('can let knockout matches start once their own groups are finished', () => {
    const s = buildStructure(groupsKo(4, 2), 16, { knockoutStart: 'ownGroups' });
    const qf = s.matches.find((m) => m.phase === 'knockout' && m.round === 1)!;
    const groupsOfSides = qf.sides.map((side) => (side.type === 'qualifier' ? side.group : -1));
    const depGroups = new Set(qf.dependsOn.map((id) => s.matches.find((m) => m.id === id)!.group));
    expect([...depGroups].sort()).toEqual([...groupsOfSides].sort());
  });

  it('pure knockout with 6 entries and all places: byes remove matches', () => {
    const s = buildStructure({ knockout: { placements: 'all' } }, 6);
    expect(s.groupSizes).toEqual([]);
    expect(s.knockout!.byes).toBe(2);
    // first round 2, semifinals 2, final + 3rd + 5th place
    expect(s.matches).toHaveLength(7);
    expect(s.matchesPerEntry).toEqual({ min: 2, max: 3 });
    // A second-round match after a bye depends only on the real first-round match
    for (const m of s.matches) {
      for (const dep of m.dependsOn) expect(s.matches.some((x) => x.id === dep)).toBe(true);
    }
  });

  it('round robin plus final of the top 2', () => {
    const s = buildStructure(groupsKo(1, 2), 5);
    expect(s.matches).toHaveLength(11);
    expect(s.matchesPerEntry).toEqual({ min: 4, max: 5 });
  });

  it('throws on invalid formats', () => {
    expect(() => buildStructure(groupsKo(2, 4), 6)).toThrow(/tooManyQualifiers/);
  });
});
