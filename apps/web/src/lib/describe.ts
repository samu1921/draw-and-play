import {
  bestNextCount,
  bracketSize,
  groupLetter,
  groupSizes,
  knockoutRoundName,
  rotationMatchesPerPlayer,
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
    a.swiss?.rounds === b.swiss?.rounds &&
    (a.rotation === undefined) === (b.rotation === undefined) &&
    (a.knockout === undefined) === (b.knockout === undefined) &&
    a.knockout?.qualifiersPerGroup === b.knockout?.qualifiersPerGroup &&
    a.knockout?.placements === b.knockout?.placements &&
    (a.knockout?.fillByes ?? false) === (b.knockout?.fillByes ?? false) &&
    a.knockout?.consolation === b.knockout?.consolation
  );
}

/** Same stages and qualifiers, whatever the settings (placement matches, rounds, consolation, …) */
export function sameBaseFormat(a: CompetitionFormat, b: CompetitionFormat): boolean {
  return (
    a.groups?.groupCount === b.groups?.groupCount &&
    (a.swiss === undefined) === (b.swiss === undefined) &&
    (a.rotation === undefined) === (b.rotation === undefined) &&
    (a.knockout === undefined) === (b.knockout === undefined) &&
    a.knockout?.qualifiersPerGroup === b.knockout?.qualifiersPerGroup
  );
}

/** Human-readable format, e.g. "Groups 3 × (4/3/3), top 2 → quarterfinals, 2 byes" */
export function describeFormat(t: Translate, format: CompetitionFormat, entryCount: number): string {
  const { groups, swiss, knockout: ko } = format;
  if (format.rotation) {
    // "Rotating partners: everybody with everybody, 7 matches each"
    const games = rotationMatchesPerPlayer(Math.max(4, entryCount));
    return t('format.rotation', games, { named: { games } });
  }
  if (!ko) {
    if (swiss) return t('format.swiss', swiss.rounds, { named: { rounds: swiss.rounds } });
    if (!groups) return '';
    return groups.groupCount === 1 ? t('format.roundRobin') : t('format.groups', { groups: groupSizesText(entryCount, groups.groupCount) });
  }
  const k = ko.qualifiersPerGroup ?? 0;
  const best = bestNextCount(format);
  const qualifiers = swiss ? k : groups ? groups.groupCount * k + best : entryCount;
  const size = bracketSize(qualifiers);
  const byes = size - qualifiers;
  const named = { k, ko: bracketText(t, size) };
  let text: string;
  if (swiss) text = t('format.swissTop', swiss.rounds, { named: { ...named, rounds: swiss.rounds } });
  else if (!groups) text = t('format.knockout', named);
  else if (groups.groupCount === 1) text = t(best > 0 ? 'format.roundRobinTopBest' : 'format.roundRobinTop', { ...named, best, rank: k + 1 });
  else text = t(best > 0 ? 'format.groupsTopBest' : 'format.groupsTop', { ...named, groups: groupSizesText(entryCount, groups.groupCount), best, rank: k + 1 });
  if (byes > 0) text += `, ${t('format.byes', byes, { named: { n: byes } })}`;
  if (ko.consolation) text += `, ${t(`format.consolation.${ko.consolation}`)}`;
  return text;
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
  phase: 'group' | 'swiss' | 'knockout' | 'placement' | 'rotation';
  group?: number | null | undefined;
  round: number;
  places?: [number, number] | null | undefined;
}

/**
 * "Group A, round 2" / "Round 3" (Swiss system, rotating partners) / "Semifinal" / "Place 7–9" (consolation field);
 * short: "A·2" / "R3" / "SF" / "P7–9"
 */
export function matchLabel(t: Translate, match: StructureMatch | MatchLabelSource, short = false): string {
  if (match.phase === 'group') {
    return t(short ? 'match.groupShort' : 'match.group', { group: groupLetter(match.group ?? 0), round: match.round });
  }
  if (match.phase === 'swiss' || match.phase === 'rotation') return t(short ? 'match.swissShort' : 'match.swiss', { round: match.round });
  // The place range to show leaves out the places that byes keep empty
  const places = match.places ?? ('bracketMatch' in match ? match.bracketMatch?.places : undefined);
  return places ? roundName(t, knockoutRoundName({ places }), short) : '';
}
