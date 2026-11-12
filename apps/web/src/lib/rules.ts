import {
  bestNextCount,
  buildStructure,
  DEFAULT_SWISS_RANKING,
  groupLetter,
  groupStagePlaces,
  knockoutRoundName,
  rotationMatchesPerPlayer,
  rotationRanking,
  type BracketStage,
  type CompetitionFormat,
  type CompetitionStructure,
  type SeatRef,
  type StandingsRow,
  type MatchRules,
  type Ranking,
  type RankingCriterion,
  type ScorePair,
  type TieBreak,
  type TieBreakStep,
} from '@draw-and-play/domain';
import type { CompetitionStateInfo, MatchInfo } from './api.js';
import { competitionText } from './competitionText.js';
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
    case 'record':
      return `${own}:${other}`;
    case 'buchholz':
    case 'fineBuchholz':
      return String(own);
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
  /** The group is still running: a draw-order step is only provisional, lots decide at the end */
  provisional?: boolean;
  /** A Swiss table: the wording speaks of rounds instead of a group */
  swiss?: boolean;
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
      if (step.skipped) return t(ctx.swiss ? 'rules.tie.headToHeadSkippedSwiss' : 'rules.tie.headToHeadSkipped');
      const names = step.entries.map(ctx.name).join(', ');
      const duels = ctx.duels(step.entries);
      const intro = t('rules.tie.headToHead', { names });
      return duels.length > 0 ? `${intro} ${duels.join(', ')}` : `${intro} ${t('rules.tie.noDuels')}`;
    }
    case 'drawOrder':
      return `${t(ctx.provisional ? (ctx.swiss ? 'rules.tie.drawOrderProvisionalSwiss' : 'rules.tie.drawOrderProvisional') : 'rules.tie.drawOrder')} ${order(step.entries.map((id) => [id]))}`;
    case 'lot':
      return `${t('rules.tie.lot')} ${order(step.entries.map((id) => [id]))}`;
  }
}

/** Whether a match counts for the table of `group`; a Swiss system and rotating partners have a single table */
export function inTable(m: { phase: string; group: number | null }, group: number): boolean {
  return m.phase === 'swiss' || m.phase === 'rotation' || (m.phase === 'group' && m.group === group);
}

/** The ties of one group in words, with names and the duels among the tied entries taken from the state */
export function groupTieTexts(t: Translate, state: CompetitionStateInfo, group: number): TieBreakText[] {
  const g = state.groups.find((x) => x.group === group);
  return g ? tableTieTexts(t, state, g, (m) => inTable(m, group)) : [];
}

/** The ties of a consolation field that plays everybody against everybody */
export function placementTieTexts(t: Translate, state: CompetitionStateInfo, stage: string): TieBreakText[] {
  const g = state.placementGroups?.find((x) => x.stage === stage);
  return g ? tableTieTexts(t, state, g, (m) => m.phase === 'placement' && m.stage === stage) : [];
}

function tableTieTexts(
  t: Translate,
  state: CompetitionStateInfo,
  g: { standings: StandingsRow[]; tieBreaks?: TieBreak[]; complete: boolean },
  counts: (m: MatchInfo) => boolean,
): TieBreakText[] {
  if (!g.tieBreaks) return [];
  const { name, score } = competitionText(t, state);
  const rank = new Map(g.standings.map((r) => [r.entryId, r.rank]));
  const finished = state.matches.filter((m) => counts(m) && m.status === 'finished');
  const duels = (ids: string[]) => {
    const members = new Set(ids);
    return finished
      .filter((m) => m.sides.every((side) => side !== null && members.has(side)))
      .map((m) => `${name(m.sides[0])} – ${name(m.sides[1])} ${score(m)}`);
  };
  // A table of rounds rather than a group: a Swiss system, or rotating partners
  const swiss = state.competition.format.swiss !== undefined || state.competition.format.rotation !== undefined;
  return g.tieBreaks.map((tie) => tieBreakText(t, tie, { name, rankOf: (id) => rank.get(id) ?? 0, duels, provisional: !g.complete, swiss }));
}

/** One line per tie for the projector's group tables: "Place 2–3: same number of wins, decided by head-to-head" */
export function tieSummary(t: Translate, tie: TieBreak, rankOf: (entryId: string) => number): string {
  const ranks = tie.entries.map(rankOf);
  const deciding = new Set<string>();
  for (const step of tie.steps) {
    if (step.type === 'drawOrder' || step.type === 'lot') deciding.add(t(`rules.criterion.${step.type}`));
    else if (step.type === 'criterion' && step.classes.length > 1) {
      deciding.add(t(`rules.criterion.${step.among ? 'headToHead' : step.criterion}`));
    }
  }
  return t('rules.tie.summary', {
    places: placesText(Math.min(...ranks), Math.max(...ranks)),
    level: t(`rules.levelOn.${tie.criterion}`),
    criteria: [...deciding].join(', '),
  });
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
  ranking: Ranking;
  /** The sport's order of a Swiss table */
  swissRanking?: Ranking;
  /** The rulebook the ranking follows, e.g. "DTTB Wettspielordnung D 7.5" */
  reference?: string;
  entryCount: number;
  drawn: boolean;
  /** Short wording for the projector: criteria without long explanations, no notes */
  compact?: boolean;
}

/** The criteria of a table as a numbered list, each with a short explanation */
function criteriaList(t: Translate, ranking: Ranking, compact: boolean, swiss: boolean): string[] {
  const hints = compact ? 'rules.short' : 'rules.hint';
  const miniTable = (ranking.headToHead ?? ranking.criteria.filter((c) => c !== 'headToHead')).map((c) => t(`rules.criterion.${c}`));
  return [...ranking.criteria, ranking.lastResort ?? ('drawOrder' as const)].map((c) => {
    // In a Swiss system the level entries have often not all met; the wording for groups would not fit.
    const key = c === 'headToHead' && swiss ? 'headToHeadSwiss' : c === 'drawOrder' && swiss ? 'drawOrderSwiss' : c;
    const hint = c === 'headToHead' ? t(`${hints}.${key}`, { criteria: miniTable.join(', ') }) : t(`${hints}.${key}`);
    return `${t(`rules.criterion.${c}`)}: ${hint}`;
  });
}

/** The format of a competition in words: matches, group order with every tie-break, who advances, places. */
export function competitionRules(t: Translate, input: RulesInput): RulesSection[] {
  const { format, matchRules, ranking } = input;
  const compact = input.compact ?? false;
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
    sections.push({
      title: t('rules.groupStage'),
      paragraphs: [
        t(format.groups.double ? 'rules.roundRobinDouble' : 'rules.roundRobin'),
        t(compact ? 'rules.short.orderIntro' : 'rules.orderIntro'),
      ],
      ordered: criteriaList(t, ranking, compact, false),
    });
    const notes = compact ? [t('rules.short.withdrawal')] : [t('rules.withdrawal'), ...(ranking.lastResort === 'lot' ? [t('rules.lotNote')] : []), t('rules.provisional')];
    if (input.reference) notes.push(input.reference);
    sections.push({ title: t('rules.notes'), paragraphs: notes });
  }

  if (format.swiss) {
    const swissRanking = input.swissRanking ?? DEFAULT_SWISS_RANKING;
    const { rounds } = format.swiss;
    sections.push({
      title: t('rules.swissStage'),
      paragraphs: compact
        ? [t('rules.short.swiss', rounds, { named: { rounds } }), t('rules.short.orderIntro')]
        : [t('rules.swissRounds', rounds, { named: { rounds } }), t('rules.swissPairing'), t('rules.swissBye'), t('rules.orderIntro')],
      ordered: criteriaList(t, swissRanking, compact, true),
    });
    const notes = compact ? [t('rules.short.swissWithdrawal')] : [t('rules.swissWithdrawal'), ...(swissRanking.lastResort === 'lot' ? [t('rules.swissLotNote')] : [])];
    if (input.reference) notes.push(input.reference);
    sections.push({ title: t('rules.notes'), paragraphs: notes });
  }

  if (format.rotation) {
    const games = rotationMatchesPerPlayer(Math.max(4, input.entryCount));
    const everybody = games === input.entryCount - 1;
    sections.push({
      title: t('rules.rotationStage'),
      paragraphs: compact
        ? [t(everybody ? 'rules.short.rotation' : 'rules.short.rotationMost', { games }), t('rules.short.orderIntro')]
        : [
            t(everybody ? 'rules.rotationPartners' : 'rules.rotationPartnersMost', { games }),
            t('rules.rotationTable'),
            t('rules.orderIntro'),
          ],
      ordered: criteriaList(t, rotationRanking(ranking), compact, true),
    });
    const notes = compact ? [t('rules.short.rotationWithdrawal')] : [t('rules.rotationWithdrawal'), t('rules.swissLotNote')];
    sections.push({ title: t('rules.notes'), paragraphs: notes });
  }

  const ko = format.knockout;
  if (ko) {
    const paragraphs: string[] = [];
    let items: string[] | undefined;
    if (format.groups || format.swiss) {
      const k = ko.qualifiersPerGroup ?? 1;
      const best = bestNextCount(format);
      if (format.swiss) {
        paragraphs.push(t('rules.advanceSwiss', { k }));
        paragraphs.push(t(compact ? 'rules.short.seedingSwiss' : 'rules.seedingSwiss'));
      } else {
        paragraphs.push(t('rules.advanceTop', k, { named: { k } }));
        if (best > 0) {
          paragraphs.push(t('rules.advanceBest', best, { named: { n: best, rank: k + 1 } }));
          if (!compact) paragraphs.push(t('rules.bestCompare', { rank: k + 1 }));
        }
        paragraphs.push(t(compact ? 'rules.short.seeding' : 'rules.seeding'));
      }
      if (structure?.knockout) {
        const { bracket, seats } = structure.knockout;
        items = bracket.matches
          .filter((m) => m.round === 1)
          .map((m) => {
            // The player first, so a bye reads "A1 – bye"
            const sides = m.sides.map((side) => (side.type === 'seat' ? seatText(t, seats[side.index] ?? null, format) : null));
            const named = sides.filter((s): s is string => s !== null);
            return [...named, ...sides.filter((s) => s === null).map(() => t('rules.bye'))].join(' – ');
          });
        paragraphs.push(t(format.swiss ? 'rules.firstRoundSwiss' : 'rules.firstRound'));
      }
    } else {
      paragraphs.push(t('rules.knockoutDraw'));
    }
    sections.push({ title: t('rules.advance'), paragraphs, ...(items && { items }) });
    if (!compact) {
      const mode = [t(`rules.knockoutMode.${ko.placements}`)];
      if (structure?.consolation) mode.push(...consolationTexts(t, structure, ko.consolation ?? 'bracket', ko.placements));
      sections.push({ title: t('rules.knockout'), paragraphs: mode });
    } else if (structure?.consolation) {
      sections.push({ title: t('rules.knockout'), paragraphs: [t(`rules.consolation.${ko.consolation}`)] });
    }
  }

  if (structure) {
    const places = [...knockoutPlaces(t, structure), ...groupPlaces(t, structure)];
    if (places.length > 0) sections.push({ title: t('rules.places'), paragraphs: [], items: places });
  }
  return sections;
}

/** How the eliminated entries play on: the mode, then what follows from the sizes of the fields */
function consolationTexts(t: Translate, structure: CompetitionStructure, mode: 'bracket' | 'perRank', placements: string): string[] {
  const { brackets, groups } = structure.consolation!;
  const texts = [t(`rules.consolation.${mode}`)];
  if (groups.length > 0) texts.push(t(brackets.length > 0 ? 'rules.consolationThree' : 'rules.consolationThreeOnly'));
  if (brackets.length > 0) texts.push(t(`rules.consolationMode.${placements}`));
  if (brackets.some((b) => b.byes > 0)) texts.push(t(brackets.some((b) => b.seeded) ? 'rules.consolationByesCompared' : 'rules.consolationByes'));
  return texts;
}

/** A bracket seat before the names are known: "A1", "3." (Swiss table) or "best 3." */
function seatText(t: Translate, seat: SeatRef | null, format: CompetitionFormat): string | null {
  if (seat?.type === 'qualifier') return format.swiss ? `${seat.rank}.` : `${groupLetter(seat.group)}${seat.rank}`;
  if (seat?.type === 'bestNext') {
    const best = bestNextCount(format);
    if (seat.rank !== (format.knockout?.qualifiersPerGroup ?? 0) + 1 || best === 0) return t('rules.anySeat', { rank: seat.rank });
    return t(seat.index < best ? 'rules.bestSeat' : 'rules.otherSeat', { rank: seat.rank });
  }
  return null;
}

/** Places decided in the brackets: played out, or shared by the losers of a round that is not played on */
function knockoutPlaces(t: Translate, structure: CompetitionStructure): string[] {
  const stages: BracketStage[] = [...(structure.knockout ? [structure.knockout] : []), ...(structure.consolation?.brackets ?? [])];
  const lines: { place: number; text: string }[] = [];
  for (const stage of stages) {
    const feeds = new Set(stage.bracket.matches.flatMap((m) => m.sides.flatMap((s) => (s.type === 'seat' ? [] : [`${s.type}:${s.match}`]))));
    const shared = new Map<number, { round: string; count: number }>();
    // Real matches only: a bye leaves no loser to place.
    for (const match of structure.matches) {
      const m = match.bracketMatch;
      if (!m || match.stage !== stage.id) continue;
      const [from, to] = m.places;
      const half = (to - from + 1) / 2;
      const round = roundName(t, knockoutRoundName({ places: match.places ?? m.places }));
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
  }
  for (const field of structure.consolation?.groups ?? []) {
    const place = field.placeOffset + 1;
    lines.push({ place, text: t('rules.placeField', { places: placesText(place, field.placeOffset + field.seats.length) }) });
  }
  for (const { seat, place } of structure.consolation?.direct ?? []) {
    lines.push({ place, text: t('rules.placeDirect', { seat: seatText(t, seat, structure.format) ?? '', place }) });
  }
  return lines.sort((a, b) => a.place - b.place).map((l) => l.text);
}

/** Places of the entries eliminated in the group stage, or of all entries without a knockout */
function groupPlaces(t: Translate, structure: CompetitionStructure): string[] {
  const tiers = groupStagePlaces(structure);
  if (tiers.length === 0) return [];
  if (!structure.knockout && tiers.every((p) => p.place === p.placeTo)) return [t('rules.placeIsRank')];
  // After a Swiss system the table has a rank for everybody who missed the knockout.
  if (structure.swiss) return [t('rules.placeIsRankRest', { place: tiers[0]!.place })];
  return tiers.map(({ rank, place, placeTo, advancing }) => {
    const places = placesText(place, placeTo);
    if (advancing > 0) return t('rules.groupPlaceRest', { rank, places });
    return place === placeTo ? t('rules.groupPlace', { rank, place }) : t('rules.groupPlaceShared', { rank, places });
  });
}
