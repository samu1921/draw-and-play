import { buildStructure } from '@draw-and-play/domain';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import de from '../i18n/locales/de.js';
import en from '../i18n/locales/en.js';
import { describeFormat, groupSizesText, matchLabel, rangeText, sameFormat, type Translate } from './describe.js';

const translator = (locale: 'en' | 'de') =>
  createI18n({ legacy: false, locale, messages: { en, de } }).global.t as unknown as Translate;

const groupsKo = (groupCount: number, qualifiersPerGroup: number) => ({
  groups: { groupCount },
  knockout: { qualifiersPerGroup, placements: 'none' as const },
});

describe('rangeText', () => {
  it('collapses equal bounds', () => {
    expect(rangeText({ min: 3, max: 6 })).toBe('3–6');
    expect(rangeText({ min: 4, max: 4 })).toBe('4');
  });
});

describe('groupSizesText', () => {
  it('shows equal and unequal group sizes', () => {
    expect(groupSizesText(16, 4)).toBe('4 × 4');
    expect(groupSizesText(10, 3)).toBe('3 × (4/3/3)');
  });
});

describe('describeFormat', () => {
  it.each([
    ['en', { groups: { groupCount: 1 } }, 5, 'Round robin'],
    ['en', groupsKo(1, 2), 5, 'Round robin, top 2 → final'],
    ['en', groupsKo(3, 2), 10, 'Groups 3 × (4/3/3), top 2 → quarterfinals, 2 byes'],
    ['en', groupsKo(4, 2), 16, 'Groups 4 × 4, top 2 → quarterfinals'],
    ['en', { knockout: { placements: 'none' as const } }, 9, 'Knockout → bracket of 16, 7 byes'],
    ['de', groupsKo(2, 2), 12, 'Gruppen 2 × 6, Top 2 → Halbfinale'],
    ['de', groupsKo(3, 1), 9, 'Gruppen 3 × 3, Top 1 → Halbfinale, 1 Freilos'],
    ['de', { groups: { groupCount: 2 } }, 8, 'Gruppen 2 × 4'],
  ] as const)('%s: %j with %i entries', (locale, format, entries, expected) => {
    expect(describeFormat(translator(locale), format, entries)).toBe(expected);
  });
});

describe('matchLabel', () => {
  it('labels group and knockout matches, long and short', () => {
    const s = buildStructure({ ...groupsKo(2, 2), knockout: { qualifiersPerGroup: 2, placements: 'thirdPlace' } }, 8);
    const groupMatch = s.matches.find((m) => m.phase === 'group' && m.group === 1 && m.round === 2)!;
    const semi = s.matches.find((m) => m.phase === 'knockout' && m.round === 1)!;
    const third = s.matches.find((m) => m.bracketMatch?.places[0] === 3)!;
    const tEn = translator('en');
    const tDe = translator('de');
    expect(matchLabel(tEn, groupMatch)).toBe('Group B, round 2');
    expect(matchLabel(tEn, groupMatch, true)).toBe('B·2');
    expect(matchLabel(tEn, semi)).toBe('Semifinal');
    expect(matchLabel(tDe, semi, true)).toBe('HF');
    expect(matchLabel(tDe, third)).toBe('Spiel um Platz 3');
  });
});

describe('sameFormat', () => {
  it('compares by content, not key order', () => {
    const a = { knockout: { placements: 'none' as const, qualifiersPerGroup: 2 }, groups: { groupCount: 3 } };
    expect(sameFormat(a, groupsKo(3, 2))).toBe(true);
    expect(sameFormat(a, groupsKo(3, 1))).toBe(false);
    expect(sameFormat({ groups: { groupCount: 1 } }, { groups: { groupCount: 1, double: false } })).toBe(true);
    expect(sameFormat({ groups: { groupCount: 1 } }, groupsKo(1, 2))).toBe(false);
  });
});
