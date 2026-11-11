import { describe, expect, it } from 'vitest';
import { defaultDisplaySettings, type CompetitionInfo, type CompetitionStateInfo, type MatchInfo } from './api.js';
import { bracketWindow, buildSlides, groupLayout, groupRevealOrder, paginate } from './displaySlides.js';

const competition = (id: string, extra: Partial<CompetitionInfo> = {}): CompetitionInfo =>
  ({ id, name: id, kind: 'singles', day: null, drawn: true, color: 0, format: { groups: { groupCount: 1 } }, ...extra }) as CompetitionInfo;

const knockoutMatch = (round: number, i: number): MatchInfo =>
  ({ key: `KO-${round}-${i}`, phase: 'knockout', round, places: [1, 2 ** (5 - round)], sides: [null, null] }) as unknown as MatchInfo;

const state = (groups: number[], extra: Partial<CompetitionStateInfo> = {}): CompetitionStateInfo =>
  ({
    entries: [],
    groups: groups.map((size, g) => ({ group: g, entries: Array.from({ length: size }, (_, i) => `g${g}e${i}`), standings: [], complete: false })),
    matches: [],
    placements: [],
    finished: false,
    ...extra,
  }) as unknown as CompetitionStateInfo;

describe('paginate', () => {
  it('uses as few pages as possible with even sizes', () => {
    expect(paginate([1, 2, 3, 4, 5], 12)).toEqual([[1, 2, 3, 4, 5]]);
    expect(paginate(Array.from({ length: 13 }, (_, i) => i), 12).map((p) => p.length)).toEqual([7, 6]);
    expect(paginate([], 4)).toEqual([]);
  });
});

describe('groupLayout', () => {
  it('fits up to eight small groups on one page, four columns wide', () => {
    expect(groupLayout([4, 4, 4, 4, 4, 4, 4, 4], false)).toEqual({ pages: [[0, 1, 2, 3, 4, 5, 6, 7]], columns: [4] });
    expect(groupLayout([5, 5, 5, 5, 5, 5], false).columns).toEqual([3]);
    expect(groupLayout([10], false)).toEqual({ pages: [[0]], columns: [1] });
  });

  it('splits many or large groups across pages', () => {
    expect(groupLayout(Array(12).fill(4), false).pages.map((p) => p.length)).toEqual([6, 6]);
    expect(groupLayout(Array(6).fill(9), false).pages.map((p) => p.length)).toEqual([3, 3]);
    expect(groupLayout(Array(8).fill(4), true).pages.map((p) => p.length)).toEqual([4, 4]);
  });
});

describe('bracketWindow', () => {
  it('takes the same part of every round', () => {
    // Lower half of a 32 bracket: 16, 8, 4, 2 and 1 matches
    expect(bracketWindow(16, 0.5, 1)).toEqual([8, 16]);
    expect(bracketWindow(8, 0.5, 1)).toEqual([4, 8]);
    expect(bracketWindow(2, 0.5, 1)).toEqual([1, 2]);
    expect(bracketWindow(1, 0.5, 1)).toEqual([0, 1]);
    expect(bracketWindow(1, 0, 0.5)).toEqual([0, 1]);
    // Byes: the second round is as tall as the first
    expect(bracketWindow(8, 0, 1)).toEqual([0, 8]);
  });
});

describe('buildSlides', () => {
  const tableIds = Array.from({ length: 14 }, (_, i) => `t${i}`);

  it('pages tables, groups, bracket halves and entry lists', () => {
    const matches = [...Array.from({ length: 16 }, (_, i) => knockoutMatch(1, i)), ...Array.from({ length: 8 }, (_, i) => knockoutMatch(2, i))];
    const entries = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, status: 'registered', members: [{ id: `p${i}`, name: `N${i}` }] }));
    const slides = buildSlides({
      settings: defaultDisplaySettings,
      today: '2026-11-07',
      competitions: [competition('singles'), competition('ko'), competition('open', { drawn: false })],
      states: new Map([
        ['singles', state([4, 4, 4])],
        ['ko', state([], { matches })],
        ['open', state([], { entries } as unknown as Partial<CompetitionStateInfo>)],
      ]),
      tableIds,
    });
    expect(slides.map((s) => s.key)).toEqual([
      'tables:0',
      'tables:1',
      'next',
      'groups:singles:0',
      'rules:singles',
      'bracket:ko:0',
      'bracket:ko:1',
      'rules:ko',
      'entries:open:0',
      'entries:open:1',
    ]);
  });

  it('follows the profile: slide types, chosen competitions and today only', () => {
    const slides = buildSlides({
      settings: { ...defaultDisplaySettings, tables: false, next: false, entries: false, competitionIds: ['a', 'b', 'c'], todayOnly: true },
      today: '2026-11-07',
      competitions: [competition('a', { day: '2026-11-07' }), competition('b', { day: '2026-11-06' }), competition('c'), competition('d'), competition('e', { drawn: false })],
      states: new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, state([3])])),
      tableIds,
    });
    expect(slides.map((s) => s.key)).toEqual(['groups:a:0', 'rules:a', 'groups:c:0', 'rules:c']);
  });

  it('adds the placements once a competition is finished', () => {
    const finished = state([3], { finished: true, placements: [{ entryId: 'x', place: 1, placeTo: 1 }] });
    const slides = buildSlides({ settings: defaultDisplaySettings, today: '', competitions: [competition('a')], states: new Map([['a', finished]]), tableIds: [] });
    expect(slides.map((s) => s.key)).toEqual(['next', 'groups:a:0', 'placements:a', 'rules:a']);
  });

  it('explains the ties of finished groups after the tables, and leaves the format out when switched off', () => {
    const tie = { criterion: 'matchPoints', entries: [], scores: [], steps: [] };
    const groups = state([4, 4, 4]).groups.map((g, i) => ({ ...g, complete: i !== 1, tieBreaks: i === 2 ? Array(5).fill(tie) : [tie] }));
    const source = { today: '', competitions: [competition('a')], states: new Map([['a', state([], { groups })]]), tableIds: [] };
    const slides = buildSlides({ ...source, settings: { ...defaultDisplaySettings, next: false } });
    expect(slides.map((s) => s.key)).toEqual(['groups:a:0', 'ties:a:0', 'ties:a:1', 'rules:a']);
    // Group B is still running: its tie is left out
    const ties = slides.flatMap((s) => (s.kind === 'ties' ? s.ties : []));
    expect(ties).toHaveLength(6);
    expect(ties.some((t) => t.group === 1)).toBe(false);
    const off = buildSlides({ ...source, settings: { ...defaultDisplaySettings, next: false, rules: false } });
    expect(off.map((s) => s.key)).toEqual(['groups:a:0']);
  });
});

describe('groupRevealOrder', () => {
  it('reveals the group heads first, then row by row', () => {
    expect(groupRevealOrder(state([3, 2]))).toEqual(['g0e0', 'g1e0', 'g0e1', 'g1e1', 'g0e2']);
  });
});
