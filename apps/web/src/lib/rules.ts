import {
  buildStructure,
  groupLetter,
  groupStagePlaces,
  knockoutRoundName,
  type CompetitionFormat,
  type CompetitionStructure,
  type MatchRules,
  type RankingCriterion,
  type ScorePair,
  type TieBreak,
  type TieBreakStep,
} from '@draw-and-play/domain';
import { describeFormat, roundName, type Translate } from './describe.js';

/** "+3", "−2" or "0" */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return '0';
}

/** A criterion's value with the score it comes from, e.g. "2:1" for wins, "+3 (7:4)" for a difference */
export function criterionValueText(criterion: RankingCriterion, [own, other]: ScorePair): string {
  switch (criterion) {
    case 'matchPoints':
      return `${own}:${other}`;
    case 'gameRatio': {
      const ratio = other === 0 ? (own === 0 ? '0' : '∞') : (own / other).toFixed(2);
      return `${ratio} (${own}:${other})`;
    }
    default:
      return `${signed(own - other)} (${own}:${other})`;
  }
}

/** "5" or "5–8", as in "place 5–8" */
export function placesText(from: number, to: number): string {
  return from === to ? String(from) : `${from}–${to}`;
}

export interface TieBreakContext {
  name: (entryId: string) => string;
  /** 1-based table rank */
  rankOf: (entryId: string) => number;
  /** Finished matches among these entries, e.g. "Anna – Ben 3:1" */
  duels: (entryIds: string[]) => string[];
}

export interface TieBreakText {
  title: string;
  /** Who was level, with the value of the first criterion */
  level: string;
  steps: string[];
}

/** One tie in a group table in words: who was level, and every step that separated them. */
export function tieBreakText(t: Translate, tie: TieBreak, ctx: TieBreakContext): TieBreakText {
  const ranks = tie.entries.map(ctx.rankOf);
  const title = t('rules.tie.title', {
    places: placesText(Math.min(...ranks), Math.max(...ranks)),
    level: t(`rules.levelOn.${tie.criterion}`),
  });
  const level = tie.entries.map((id, i) => `${ctx.name(id)} ${criterionValueText(tie.criterion, tie.scores[i]!)}`).join(' · ');
  return { title, level, steps: tie.steps.map((step) => stepText(t, step, ctx)) };
}

function stepText(t: Translate, step: TieBreakStep, ctx: TieBreakContext): string {
  const order = (classes: string[][]) => classes.map((c) => c.map(ctx.name).join(' = ')).join(' › ');
  switch (step.type) {
    case 'criterion': {
      const label = t(`rules.criterion.${step.criterion}`) + (step.among ? ` (${t('rules.tie.among')})` : '');
      const values = step.entries.map((id, i) => `${ctx.name(id)} ${criterionValueText(step.criterion, step.scores[i]!)}`).join(' · ');
      const outcome = step.classes.length === 1 ? t('rules.tie.noDecision') : order(step.classes);
      return `${label}: ${values} → ${outcome}`;
    }
    case 'headToHead': {
      if (step.skipped) return t('rules.tie.headToHeadSkipped');
      const names = step.entries.map(ctx.name).join(', ');
      const duels = ctx.duels(step.entries);
      const intro = t('rules.tie.headToHead', { names });
      return duels.length > 0 ? `${intro} ${duels.join(', ')}` : `${intro} ${t('rules.tie.noDuels')}`;
    }
    case 'drawOrder':
      return `${t('rules.tie.drawOrder')} ${order(step.entries.map((id) => [id]))}`;
  }
}

export interface RulesSection {
  title: string;
  paragraphs: string[];
  /** Ordered list, e.g. the standings criteria */
  ordered?: string[];
  /** Unordered list, e.g. pairings or places */
  items?: string[];
}

export interface RulesInput {
  format: CompetitionFormat;
  matchRules: MatchRules;
  /** The sport's standings order */
  ranking: readonly RankingCriterion[];
  entryCount: number;
  drawn: boolean;
}

/** The format of a competition in words: matches, group order with every tie-break, who advances, places. */
export function competitionRules(t: Translate, input: RulesInput): RulesSection[] {
  const { format, matchRules, ranking } = input;
  let structure: CompetitionStructure | null = null;
  try {
    structure = buildStructure(format, input.entryCount);
  } catch {
    // Not enough entries yet for this format: describe it without sizes and places.
  }
  const sections: RulesSection[] = [];

  const flow = structure ? [describeFormat(t, format, input.entryCount)] : [];
  if (!input.drawn) flow.push(t('rules.notDrawn'));
  if (flow.length > 0) sections.push({ title: t('rules.flow'), paragraphs: flow });

  const total = matchRules.gamesToWin * 2 - 1;
  const games = [
    t('rules.bestOf', { n: matchRules.gamesToWin, total }),
    matchRules.winBy > 1 ? t('rules.gameTo', { points: matchRules.pointsPerGame, winBy: matchRules.winBy }) : t('rules.gameToPlain', { points: matchRules.pointsPerGame }),
  ];
  if (matchRules.pointCap !== undefined) games.push(t('rules.pointCap', { cap: matchRules.pointCap }));
  sections.push({ title: t('rules.matches'), paragraphs: [games.join(' ')] });

  if (format.groups) {
    const miniTable = ranking.filter((c) => c !== 'headToHead').map((c) => t(`rules.criterion.${c}`));
    const ordered = [...ranking, 'drawOrder' as const].map((c) => {
      const hint = c === 'headToHead' ? t('rules.hint.headToHead', { criteria: miniTable.join(', ') }) : t(`rules.hint.${c}`);
      return `${t(`rules.criterion.${c}`)}: ${hint}`;
    });
    sections.push({
      title: t('rules.groupStage'),
      paragraphs: [t(format.groups.double ? 'rules.roundRobinDouble' : 'rules.roundRobin'), t('rules.orderIntro')],
      ordered,
    });
    sections.push({ title: t('rules.notes'), paragraphs: [t('rules.walkover'), t('rules.provisional')] });
  }

  const ko = format.knockout;
  if (ko) {
    const paragraphs: string[] = [];
    let items: string[] | undefined;
    if (format.groups) {
      paragraphs.push(t('rules.advanceTop', ko.qualifiersPerGroup ?? 1, { named: { k: ko.qualifiersPerGroup } }));
      paragraphs.push(t('rules.seeding'));
      if (structure?.knockout) {
        const { bracket, seats } = structure.knockout;
        const seat = (index: number) => {
          const s = seats[index];
          return s?.type === 'qualifier' ? `${groupLetter(s.group)}${s.rank}` : null;
        };
        items = bracket.matches
          .filter((m) => m.round === 1)
          .map((m) => {
            // The player first, so a bye reads "A1 – bye"
            const sides = m.sides.map((side) => (side.type === 'seat' ? seat(side.index) : null));
            const named = sides.filter((s): s is string => s !== null);
            return [...named, ...sides.filter((s) => s === null).map(() => t('rules.bye'))].join(' – ');
          });
        paragraphs.push(t('rules.firstRound'));
      }
    } else {
      paragraphs.push(t('rules.knockoutDraw'));
    }
    sections.push({ title: t('rules.advance'), paragraphs, ...(items && { items }) });
    sections.push({ title: t('rules.knockout'), paragraphs: [t(`rules.knockoutMode.${ko.placements}`)] });
  }

  if (structure) {
    const places = [...knockoutPlaces(t, structure), ...groupPlaces(t, structure)];
    if (places.length > 0) sections.push({ title: t('rules.places'), paragraphs: [], items: places });
  }
  return sections;
}

/** Places decided in the knockout: played out, or shared by the losers of a round that is not played on */
function knockoutPlaces(t: Translate, structure: CompetitionStructure): string[] {
  const bracket = structure.knockout?.bracket;
  if (!bracket) return [];
  const feeds = new Set(bracket.matches.flatMap((m) => m.sides.flatMap((s) => (s.type === 'seat' ? [] : [`${s.type}:${s.match}`]))));
  const lines: { place: number; text: string }[] = [];
  const shared = new Map<number, { round: string; count: number }>();
  // Real matches only: a bye leaves no loser to place.
  for (const { bracketMatch: m } of structure.matches) {
    if (!m) continue;
    const [from, to] = m.places;
    const half = (to - from + 1) / 2;
    const round = roundName(t, knockoutRoundName(m));
    if (feeds.has(`loser:${m.id}`)) continue;
    if (!feeds.has(`winner:${m.id}`)) {
      lines.push({ place: from, text: t('rules.placeMatch', { round, winner: from, loser: from + 1 }) });
    } else {
      const loserFrom = from + half;
      const entry = shared.get(loserFrom) ?? { round, count: 0 };
      entry.count++;
      shared.set(loserFrom, entry);
    }
  }
  for (const [place, { round, count }] of shared) {
    lines.push({
      place,
      text: count === 1 ? t('rules.placeLoser', { round, place }) : t('rules.placeShared', { round, places: placesText(place, place + count - 1) }),
    });
  }
  return lines.sort((a, b) => a.place - b.place).map((l) => l.text);
}

/** Places of the entries eliminated in the group stage, or of all entries without a knockout */
function groupPlaces(t: Translate, structure: CompetitionStructure): string[] {
  const tiers = groupStagePlaces(structure);
  if (tiers.length === 0) return [];
  if (!structure.knockout && tiers.every((p) => p.place === p.placeTo)) return [t('rules.placeIsRank')];
  return tiers.map(({ rank, place, placeTo }) =>
    place === placeTo ? t('rules.groupPlace', { rank, place }) : t('rules.groupPlaceShared', { rank, places: placesText(place, placeTo) }),
  );
}
