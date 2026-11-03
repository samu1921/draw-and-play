import {
  buildStructure,
  type CompetitionFormat,
  type PlacementMode,
  type SeatRef,
  type StructureMatch,
  type StructureOptions,
} from './format.js';
import { groupSizes } from './groupDraw.js';
import { scheduleTasks, type ScheduledMatch, type ScheduleTask } from './scheduler.js';

export interface CompetitionPlan {
  id: string;
  entryCount: number;
  format: CompetitionFormat;
  /** Estimated duration of one match, e.g. from `SportProfile.estimateMatchMinutes` */
  matchMinutes: number;
  /** Not before this time (minutes) */
  earliestStart?: number;
  /** Competitions that must be finished before this one starts, e.g. singles after doubles */
  startAfter?: readonly string[];
  /** Allowed tables; default all */
  tables?: readonly string[];
  structure?: StructureOptions;
  /**
   * Real people behind a seat once the draw is known, so that conflicts across competitions are respected
   * (someone playing doubles and singles). Without it every seat is a separate placeholder person.
   */
  participants?: (seat: SeatRef) => readonly string[] | undefined;
}

export interface PlanInput {
  competitions: readonly CompetitionPlan[];
  tables: readonly string[];
  startMin: number;
  minRestMin?: number;
  /** Safety margin on the elapsed time, shown as a range: "final between 15:30 and 16:00" */
  buffer?: { percent?: number; minutes?: number };
}

export interface CompetitionForecast {
  id: string;
  matchCount: number;
  matchesPerEntry: { min: number; max: number };
  groupSizes: number[];
  knockoutSize?: number;
  byes: number;
  start: number;
  /** End of the group stage, if there is one */
  groupStageEnd?: number;
  end: number;
  /** End including the buffer */
  endLate: number;
  /** Longest break a single entry has between two of its matches */
  longestWaitMin: number;
  unscheduled: number;
}

export interface PlannedMatch extends ScheduledMatch {
  competitionId: string;
  /** Phase, group, round and bracket position, e.g. for labels */
  match: StructureMatch;
}

export interface PlanResult {
  competitions: CompetitionForecast[];
  matches: PlannedMatch[];
  start: number;
  end: number;
  endLate: number;
  /** Share of table time in use between start and end (0–1) */
  tableUtilization: number;
}

const taskId = (competitionId: string, matchId: string) => `${competitionId}:${matchId}`;

function seatToken(competitionId: string, seat: SeatRef): string | undefined {
  switch (seat.type) {
    case 'groupSeat':
      return `${competitionId}/G${seat.group}.${seat.position}`;
    case 'drawSeat':
      return `${competitionId}/S${seat.position}`;
    default:
      // Qualifiers and winners/losers are ordered through dependencies instead.
      return undefined;
  }
}

/** Simulates a whole tournament day: all competitions share the tables and people cannot play twice at once. */
export function simulatePlan(input: PlanInput): PlanResult {
  const built = input.competitions.map((plan) => ({ plan, structure: buildStructure(plan.format, plan.entryCount, plan.structure) }));
  const idsOf = new Map(built.map(({ plan, structure }) => [plan.id, structure.matches.map((m) => taskId(plan.id, m.id))]));

  const tasks: ScheduleTask[] = built.flatMap(({ plan, structure }) => {
    const before = (plan.startAfter ?? []).flatMap((id) => idsOf.get(id) ?? []);
    return structure.matches.map((m) => ({
      id: taskId(plan.id, m.id),
      durationMin: plan.matchMinutes,
      participants: m.sides.flatMap((seat) => plan.participants?.(seat) ?? seatToken(plan.id, seat) ?? []),
      // Roots wait for the preceding competitions; everything else follows them transitively.
      dependsOn: m.dependsOn.length > 0 ? m.dependsOn.map((d) => taskId(plan.id, d)) : before,
      ...(plan.earliestStart !== undefined && { earliestStart: plan.earliestStart }),
      ...(plan.tables && { tables: plan.tables }),
    }));
  });

  const result = scheduleTasks({
    tasks,
    tables: input.tables,
    startMin: input.startMin,
    ...(input.minRestMin !== undefined && { minRestMin: input.minRestMin }),
  });
  const byTask = new Map(result.matches.map((m) => [m.taskId, m]));
  const late = (end: number) =>
    end + Math.round(((end - input.startMin) * (input.buffer?.percent ?? 0)) / 100) + (input.buffer?.minutes ?? 0);

  const competitions = built.map(({ plan, structure }): CompetitionForecast => {
    const slot = (matchId: string) => byTask.get(taskId(plan.id, matchId));
    const placed = structure.matches.flatMap((m) => slot(m.id) ?? []);
    const groupEnds = structure.matches.filter((m) => m.phase === 'group').flatMap((m) => slot(m.id)?.end ?? []);
    const start = Math.min(...placed.map((m) => m.start));
    const end = Math.max(...placed.map((m) => m.end));

    // Breaks: between consecutive matches of a placeholder person, and from a qualifying group or
    // preceding knockout match to the next knockout match.
    const waits: number[] = [];
    const timesOf = new Map<string, ScheduledMatch[]>();
    for (const m of structure.matches) {
      const s = slot(m.id);
      if (!s) continue;
      for (const seat of m.sides) {
        const token = seatToken(plan.id, seat);
        if (token) timesOf.set(token, [...(timesOf.get(token) ?? []), s]);
        if (seat.type === 'winner' || seat.type === 'loser') {
          const prior = byTask.get(taskId(plan.id, seat.match));
          if (prior) waits.push(s.start - prior.end);
        }
        if (seat.type === 'qualifier') {
          const groupEnd = Math.max(
            ...structure.matches.filter((g) => g.group === seat.group && g.phase === 'group').flatMap((g) => slot(g.id)?.end ?? []),
          );
          waits.push(s.start - groupEnd);
        }
      }
    }
    for (const times of timesOf.values()) {
      times.sort((a, b) => a.start - b.start);
      for (let i = 1; i < times.length; i++) waits.push(times[i]!.start - times[i - 1]!.end);
    }

    return {
      id: plan.id,
      matchCount: structure.matches.length,
      matchesPerEntry: structure.matchesPerEntry,
      groupSizes: structure.groupSizes,
      ...(structure.knockout && { knockoutSize: structure.knockout.bracket.size }),
      byes: structure.knockout?.byes ?? 0,
      start,
      ...(groupEnds.length > 0 && { groupStageEnd: Math.max(...groupEnds) }),
      end,
      endLate: late(end),
      longestWaitMin: Math.max(0, ...waits),
      unscheduled: structure.matches.length - placed.length,
    };
  });

  const matchOf = new Map(
    built.flatMap(({ plan, structure }) => structure.matches.map((m) => [taskId(plan.id, m.id), { competitionId: plan.id, match: m }] as const)),
  );
  const matches = result.matches.map((m): PlannedMatch => ({ ...m, ...matchOf.get(m.taskId)! }));
  const span = result.end - input.startMin;
  return {
    competitions,
    matches,
    start: input.startMin,
    end: result.end,
    endLate: late(result.end),
    tableUtilization: span > 0 ? result.busyMin / (span * input.tables.length) : 0,
  };
}

/** A candidate format with a stable id: `rr`, `rr-top2`, `g3-top2`, `ko`, … */
export interface FormatVariant {
  id: string;
  format: CompetitionFormat;
}

export interface VariantOptions {
  placements?: PlacementMode;
  /** Largest single round robin to offer (default 12) */
  maxRoundRobin?: number;
  /** Largest group in a group stage (default 8) */
  maxGroupSize?: number;
}

/** All sensible formats for a number of entries, for the planner's comparison table. */
export function generateVariants(entryCount: number, options: VariantOptions = {}): FormatVariant[] {
  const placements = options.placements ?? 'none';
  const maxRoundRobin = options.maxRoundRobin ?? 12;
  const maxGroupSize = options.maxGroupSize ?? 8;
  const variants: FormatVariant[] = [];
  const n = entryCount;

  if (n >= 2 && n <= maxRoundRobin) {
    variants.push({ id: 'rr', format: { groups: { groupCount: 1 } } });
    if (n >= 4) variants.push({ id: 'rr-top2', format: { groups: { groupCount: 1 }, knockout: { qualifiersPerGroup: 2, placements } } });
    if (n >= 6) variants.push({ id: 'rr-top4', format: { groups: { groupCount: 1 }, knockout: { qualifiersPerGroup: 4, placements } } });
  }

  for (let groupCount = 2; groupCount <= Math.floor(n / 3); groupCount++) {
    const sizes = groupSizes(n, groupCount);
    const smallest = Math.min(...sizes);
    if (Math.max(...sizes) > maxGroupSize) continue;
    for (const k of [1, 2, 4]) {
      // Someone must drop out of every group, and the knockout stays manageable.
      if (k >= smallest || groupCount * k > 16) continue;
      variants.push({
        id: `g${groupCount}-top${k}`,
        format: { groups: { groupCount }, knockout: { qualifiersPerGroup: k, placements } },
      });
    }
  }

  if (n >= 3) variants.push({ id: 'ko', format: { knockout: { placements } } });
  return variants;
}

export interface VariantComparison {
  variant: FormatVariant;
  forecast: CompetitionForecast;
  /** End of the whole day with this variant, because competitions share tables and people */
  planEnd: number;
  planEndLate: number;
  tableUtilization: number;
}

/** Simulates the day once per variant of one competition, keeping all other competitions as they are. */
export function compareVariants(
  input: PlanInput,
  competitionId: string,
  variants: readonly FormatVariant[],
): VariantComparison[] {
  return variants.map((variant) => {
    const plan = simulatePlan({
      ...input,
      competitions: input.competitions.map((c) => (c.id === competitionId ? { ...c, format: variant.format } : c)),
    });
    return {
      variant,
      forecast: plan.competitions.find((c) => c.id === competitionId)!,
      planEnd: plan.end,
      planEndLate: plan.endLate,
      tableUtilization: plan.tableUtilization,
    };
  });
}
