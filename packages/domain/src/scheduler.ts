/** A match to place on a table. Times are minutes (e.g. since midnight of the tournament day). */
export interface ScheduleTask {
  id: string;
  durationMin: number;
  /** People playing; a person plays one match at a time, across all competitions */
  participants: readonly string[];
  /** Tasks that must be finished first (e.g. the semifinals before the final) */
  dependsOn: readonly string[];
  earliestStart?: number;
  /** Allowed tables; default all */
  tables?: readonly string[];
}

/** A match that is already running or finished; it keeps its table and times. */
export interface ScheduledMatch {
  taskId: string;
  table: string;
  start: number;
  end: number;
}

export interface ScheduleInput {
  tasks: readonly ScheduleTask[];
  tables: readonly string[];
  /** Nothing new starts before this time ("now" in a live forecast) */
  startMin: number;
  /** Minimum break for a person between two matches, and after a match a later one depends on */
  minRestMin?: number;
  fixed?: readonly ScheduledMatch[];
}

export interface ScheduleResult {
  matches: ScheduledMatch[];
  /** Tasks that can never start (no allowed table, or waiting for such a task) */
  unscheduled: string[];
  end: number;
  /** Sum of table time used */
  busyMin: number;
}

/**
 * List scheduling: whenever a table is free, the waiting task with the longest remaining chain
 * (critical path, including each person's following matches) starts first.
 */
export function scheduleTasks(input: ScheduleInput): ScheduleResult {
  const rest = input.minRestMin ?? 0;
  const tableSet = new Set(input.tables);
  const taskIds = new Set(input.tasks.map((t) => t.id));
  const fixed = new Map((input.fixed ?? []).map((f) => [f.taskId, f]));
  const scheduled = new Map<string, ScheduledMatch>(fixed);
  const tableFree = new Map(input.tables.map((t) => [t, input.startMin]));
  const personFree = new Map<string, number>();

  for (const task of input.tasks) {
    const f = fixed.get(task.id);
    if (!f) continue;
    tableFree.set(f.table, Math.max(tableFree.get(f.table) ?? input.startMin, f.end));
    for (const p of task.participants) personFree.set(p, Math.max(personFree.get(p) ?? 0, f.end + rest));
  }

  const priority = criticalPath(input.tasks);
  const pending = input.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => !fixed.has(task.id))
    .sort((a, b) => priority.get(b.task.id)! - priority.get(a.task.id)! || a.index - b.index)
    .map(({ task }) => task);

  /** Earliest start once all dependencies are placed; undefined while some are not (or never will be) */
  const readyAt = (task: ScheduleTask): number | undefined => {
    let at = Math.max(input.startMin, task.earliestStart ?? input.startMin);
    for (const dep of task.dependsOn) {
      const done = scheduled.get(dep);
      if (!done) return undefined;
      at = Math.max(at, done.end + rest);
    }
    for (const p of task.participants) at = Math.max(at, personFree.get(p) ?? at);
    return at;
  };
  const allowedTables = (task: ScheduleTask) => (task.tables ?? input.tables).filter((t) => tableSet.has(t));
  const impossible = (task: ScheduleTask) =>
    allowedTables(task).length === 0 || task.dependsOn.some((d) => !taskIds.has(d) && !fixed.has(d));

  const waiting = new Set(pending.filter((t) => !impossible(t)));
  let time = input.startMin;
  while (waiting.size > 0) {
    for (const task of pending) {
      if (!waiting.has(task)) continue;
      const at = readyAt(task);
      if (at === undefined || at > time) continue;
      const table = allowedTables(task).find((t) => tableFree.get(t)! <= time);
      if (!table) continue;
      const match = { taskId: task.id, table, start: time, end: time + task.durationMin };
      scheduled.set(task.id, match);
      tableFree.set(table, match.end);
      for (const p of task.participants) personFree.set(p, match.end + rest);
      waiting.delete(task);
    }

    const upcoming = [
      ...tableFree.values(),
      ...personFree.values(),
      ...[...waiting].map(readyAt).filter((t): t is number => t !== undefined),
    ].filter((t) => t > time);
    if (upcoming.length === 0) break;
    time = Math.min(...upcoming);
  }

  const matches = input.tasks.flatMap((t) => scheduled.get(t.id) ?? []);
  return {
    matches,
    unscheduled: input.tasks.filter((t) => !scheduled.has(t.id)).map((t) => t.id),
    end: Math.max(input.startMin, ...matches.map((m) => m.end)),
    busyMin: matches.reduce((sum, m) => sum + (m.end - m.start), 0),
  };
}

/** Longest duration from each task to the end, following dependencies and each person's next match. */
function criticalPath(tasks: readonly ScheduleTask[]): Map<string, number> {
  const successors = new Map<string, string[]>(tasks.map((t) => [t.id, []]));
  const lastOfPerson = new Map<string, string>();
  for (const task of tasks) {
    for (const dep of task.dependsOn) successors.get(dep)?.push(task.id);
    for (const p of task.participants) {
      const previous = lastOfPerson.get(p);
      if (previous) successors.get(previous)!.push(task.id);
      lastOfPerson.set(p, task.id);
    }
  }

  const duration = new Map(tasks.map((t) => [t.id, t.durationMin]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const length = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // cycle guard; inputs from buildStructure are acyclic
    visiting.add(id);
    const value = duration.get(id)! + Math.max(0, ...successors.get(id)!.map(length));
    visiting.delete(id);
    memo.set(id, value);
    return value;
  };
  for (const t of tasks) length(t.id);
  return memo;
}
