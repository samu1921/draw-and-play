import { describe, expect, it } from 'vitest';
import { scheduleTasks, type ScheduleTask } from './scheduler.js';

const task = (id: string, participants: string[], extra: Partial<ScheduleTask> = {}): ScheduleTask => ({
  id,
  durationMin: 30,
  participants,
  dependsOn: [],
  ...extra,
});

const byId = (result: ReturnType<typeof scheduleTasks>) => new Map(result.matches.map((m) => [m.taskId, m]));

describe('scheduleTasks', () => {
  it('fills all tables in parallel', () => {
    const result = scheduleTasks({
      tables: ['T1', 'T2'],
      startMin: 600,
      tasks: [task('a', ['P1', 'P2']), task('b', ['P3', 'P4']), task('c', ['P5', 'P6']), task('d', ['P7', 'P8'])],
    });
    expect(result.end).toBe(660);
    expect(result.unscheduled).toEqual([]);
    const starts = result.matches.map((m) => m.start).sort();
    expect(starts).toEqual([600, 600, 630, 630]);
  });

  it('never lets a person play two matches at the same time', () => {
    const result = scheduleTasks({
      tables: ['T1', 'T2'],
      startMin: 0,
      tasks: [task('a', ['P1', 'P2']), task('b', ['P1', 'P3'])],
    });
    const m = byId(result);
    expect(m.get('a')!.start).toBe(0);
    expect(m.get('b')!.start).toBe(30);
  });

  it('waits for dependencies and the minimum rest', () => {
    const result = scheduleTasks({
      tables: ['T1', 'T2'],
      startMin: 0,
      minRestMin: 10,
      tasks: [task('a', ['P1', 'P2']), task('b', ['P3', 'P4'], { durationMin: 45 }), task('final', [], { dependsOn: ['a', 'b'] })],
    });
    expect(byId(result).get('final')!.start).toBe(55);
  });

  it('applies the minimum rest to people as well', () => {
    const result = scheduleTasks({
      tables: ['T1', 'T2'],
      startMin: 0,
      minRestMin: 15,
      tasks: [task('a', ['P1', 'P2']), task('b', ['P1', 'P3'])],
    });
    expect(byId(result).get('b')!.start).toBe(45);
  });

  it('respects the earliest start', () => {
    const result = scheduleTasks({ tables: ['T1'], startMin: 0, tasks: [task('a', ['P1', 'P2'], { earliestStart: 90 })] });
    expect(byId(result).get('a')!.start).toBe(90);
  });

  it('only uses allowed tables', () => {
    const result = scheduleTasks({
      tables: ['T1', 'T2', 'T3'],
      startMin: 0,
      tasks: [task('a', ['P1', 'P2'], { tables: ['T3'] }), task('b', ['P3', 'P4'], { tables: ['T3'] })],
    });
    expect(result.matches.every((m) => m.table === 'T3')).toBe(true);
    expect(result.end).toBe(60);
  });

  it('prefers the longest remaining chain (critical path)', () => {
    // Listed in an unfavourable order: three independent matches first, then a chain of three.
    const result = scheduleTasks({
      tables: ['T1', 'T2'],
      startMin: 0,
      tasks: [
        task('y1', ['A', 'B']),
        task('y2', ['C', 'D']),
        task('y3', ['E', 'F']),
        task('x1', ['G', 'H']),
        task('x2', [], { dependsOn: ['x1'] }),
        task('x3', [], { dependsOn: ['x2'] }),
      ],
    });
    expect(result.end).toBe(90);
  });

  it('keeps fixed (running or finished) matches and plans around them', () => {
    const result = scheduleTasks({
      tables: ['T1'],
      startMin: 20,
      fixed: [{ taskId: 'running', table: 'T1', start: 0, end: 30 }],
      tasks: [task('running', ['P1', 'P2']), task('next', ['P1', 'P3']), task('after', [], { dependsOn: ['running'] })],
    });
    const m = byId(result);
    expect(m.get('running')).toEqual({ taskId: 'running', table: 'T1', start: 0, end: 30 });
    expect(m.get('next')!.start).toBe(30);
    expect(m.get('after')!.start).toBe(60);
  });

  it('reports tasks that can never be scheduled', () => {
    const result = scheduleTasks({
      tables: ['T1'],
      startMin: 0,
      tasks: [task('a', ['P1', 'P2'], { tables: ['T9'] }), task('b', [], { dependsOn: ['a'] }), task('c', ['P3', 'P4'])],
    });
    expect(result.unscheduled.sort()).toEqual(['a', 'b']);
    expect(result.matches.map((m) => m.taskId)).toEqual(['c']);
  });

  it('reports table busy time', () => {
    const result = scheduleTasks({
      tables: ['T1', 'T2'],
      startMin: 0,
      tasks: [task('a', ['P1', 'P2']), task('b', ['P1', 'P3'])],
    });
    expect(result.busyMin).toBe(60);
    expect(result.end).toBe(60);
  });
});
