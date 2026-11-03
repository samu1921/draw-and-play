import {
  bracketSize,
  groupLetter,
  groupSizes,
  knockoutRoundName,
  type CompetitionFormat,
  type KnockoutRoundName,
  type PlacementMode,
  type StructureMatch,
} from '@draw-and-play/domain';

/** The subset of vue-i18n's `t` used here, so the helpers can be tested without components */
export type Translate = {
  (key: string, named?: Record<string, unknown>): string;
  (key: string, plural: number, options?: { named?: Record<string, unknown> }): string;
};

/** "3–6", or just "4" when everyone plays the same number of matches */
export function rangeText({ min, max }: { min: number; max: number }): string {
  return min === max ? String(min) : `${min}–${max}`;
}

/** "4 × 4" or "3 × (4/3/3)" */
export function groupSizesText(entryCount: number, groupCount: number): string {
  const sizes = groupSizes(entryCount, groupCount);
  return sizes.every((s) => s === sizes[0]) ? `${groupCount} × ${sizes[0]}` : `${groupCount} × (${sizes.join('/')})`;
}

function bracketText(t: Translate, size: number): string {
  if (size === 2) return t('format.ko.final');
  if (size === 4) return t('format.ko.semifinals');
  if (size === 8) return t('format.ko.quarterfinals');
  return t('format.ko.bracket', { size });
}

/** Same format, compared by content rather than by object identity or key order */
export function sameFormat(a: CompetitionFormat, b: CompetitionFormat): boolean {
  return (
    a.groups?.groupCount === b.groups?.groupCount &&
    (a.groups?.double ?? false) === (b.groups?.double ?? false) &&
    (a.knockout === undefined) === (b.knockout === undefined) &&
    a.knockout?.qualifiersPerGroup === b.knockout?.qualifiersPerGroup &&
    a.knockout?.placements === b.knockout?.placements
  );
}

/** Human-readable format, e.g. "Groups 3 × (4/3/3), top 2 → quarterfinals, 2 byes" */
export function describeFormat(t: Translate, format: CompetitionFormat, entryCount: number): string {
  const groups = format.groups;
  const ko = format.knockout;
  if (groups && !ko) {
    return groups.groupCount === 1 ? t('format.roundRobin') : t('format.groups', { groups: groupSizesText(entryCount, groups.groupCount) });
  }
  if (!ko) return '';
  const qualifiers = groups ? groups.groupCount * (ko.qualifiersPerGroup ?? 0) : entryCount;
  const size = bracketSize(qualifiers);
  const byes = size - qualifiers;
  let text: string;
  if (!groups) text = t('format.knockout', { ko: bracketText(t, size) });
  else if (groups.groupCount === 1) text = t('format.roundRobinTop', { k: ko.qualifiersPerGroup, ko: bracketText(t, size) });
  else text = t('format.groupsTop', { groups: groupSizesText(entryCount, groups.groupCount), k: ko.qualifiersPerGroup, ko: bracketText(t, size) });
  return byes > 0 ? `${text}, ${t('format.byes', byes, { named: { n: byes } })}` : text;
}

export function describePlacements(t: Translate, mode: PlacementMode): string {
  return t(`placements.${mode}`);
}

export function roundName(t: Translate, name: KnockoutRoundName, short = false): string {
  const prefix = short ? 'roundShort' : 'round';
  switch (name.type) {
    case 'main':
      if (name.size === 2) return t(`${prefix}.final`);
      if (name.size === 4) return t(`${prefix}.semifinal`);
      if (name.size === 8) return t(`${prefix}.quarterfinal`);
      return t(`${prefix}.roundOf`, { size: name.size });
    case 'placementMatch':
      return t(`${prefix}.placementMatch`, { place: name.place });
    case 'placementRound':
      return t(`${prefix}.placementRound`, { from: name.from, to: name.to });
  }
}

/** The parts of a match that its label depends on: from the planner structure or from the API */
export interface MatchLabelSource {
  phase: 'group' | 'knockout';
  group?: number | null | undefined;
  round: number;
  places?: [number, number] | null | undefined;
}

/** "Group A, round 2" / "Semifinal"; short: "A·2" / "SF" */
export function matchLabel(t: Translate, match: StructureMatch | MatchLabelSource, short = false): string {
  if (match.phase === 'group') {
    return t(short ? 'match.groupShort' : 'match.group', { group: groupLetter(match.group ?? 0), round: match.round });
  }
  const places = 'bracketMatch' in match ? match.bracketMatch?.places : (match as MatchLabelSource).places;
  return places ? roundName(t, knockoutRoundName({ places }), short) : '';
}
