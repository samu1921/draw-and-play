import { simulatePlan } from '@draw-and-play/domain';
import { describe, expect, it } from 'vitest';
import { allowedTables, createCompetition, emptyDraft, nextColor, resolveVariant, toPlanInput, type PlannerDraft } from './planDraft.js';

/** The Saturday of the concept: doubles, then singles; hobby from 13:00 */
function saturday(): PlannerDraft {
  const draft = emptyDraft();
  const add = (values: Parameters<typeof createCompetition>[1]) => {
    const c = createCompetition(draft.competitions, values);
    draft.competitions.push(c);
    return c;
  };
  const doubles = add({ name: 'Doubles', entryCount: 8, variantId: 'g2-top2' });
  add({ name: 'Singles', entryCount: 12, variantId: 'g3-top2', startAfter: doubles.id });
  add({ name: 'Hobby', entryCount: 5, gamesToWin: 2, variantId: 'rr', earliestStart: '13:00' });
  return draft;
}

describe('createCompetition', () => {
  it('derives the match duration from the scoring and picks a valid format', () => {
    const c = createCompetition([], { name: 'Hobby', entryCount: 5, gamesToWin: 2 });
    expect(c.matchMinutes).toBe(20);
    expect(c.variantId).toBe('rr');
  });

  it('assigns the smallest free color slot, so colors never shift', () => {
    const a = createCompetition([], { name: 'A' });
    const b = createCompetition([a], { name: 'B' });
    const c = createCompetition([a, b], { name: 'C' });
    expect([a.color, b.color, c.color]).toEqual([0, 1, 2]);
    expect(nextColor([a, c])).toBe(1);
  });
});

describe('resolveVariant', () => {
  it('falls back to the first format when the chosen one no longer fits', () => {
    const c = createCompetition([], { name: 'Singles', entryCount: 16, variantId: 'g4-top2' });
    expect(resolveVariant(c)!.id).toBe('g4-top2');
    expect(resolveVariant({ ...c, entryCount: 6 })!.id).toBe('rr');
  });
});

describe('allowedTables', () => {
  const c = createCompetition([], { name: 'Hobby' });

  it('is undefined for all tables and clamps ranges to the table count', () => {
    expect(allowedTables(c, 8)).toBeUndefined();
    expect(allowedTables({ ...c, tableFrom: 7, tableTo: 8 }, 8)).toEqual(['7', '8']);
    expect(allowedTables({ ...c, tableFrom: 3, tableTo: 12 }, 4)).toEqual(['3', '4']);
    expect(allowedTables({ ...c, tableFrom: null, tableTo: 2 }, 4)).toEqual(['1', '2']);
  });
});

describe('toPlanInput', () => {
  it('starts empty', () => {
    expect(emptyDraft().competitions).toEqual([]);
    expect(toPlanInput(emptyDraft()).competitions).toEqual([]);
  });

  it('converts a planned day into a plan the domain can simulate', () => {
    const draft = saturday();
    const input = toPlanInput(draft);
    expect(input.tables).toEqual(['1', '2', '3', '4']);
    expect(input.startMin).toBe(600);
    expect(input.buffer).toEqual({ percent: 10, minutes: 0 });
    const [doubles, singles, hobby] = input.competitions;
    expect(singles!.startAfter).toEqual([doubles!.id]);
    expect(hobby!.earliestStart).toBe(13 * 60);
    expect(hobby!.matchMinutes).toBe(20);

    const plan = simulatePlan(input);
    const [d, s, h] = plan.competitions;
    expect(s!.start).toBe(d!.end);
    expect(h!.start).toBeGreaterThanOrEqual(13 * 60);
  });

  it('ignores a start dependency on a later competition', () => {
    const draft = saturday();
    const swapped: PlannerDraft = { ...draft, competitions: [draft.competitions[1]!, draft.competitions[0]!] };
    expect(toPlanInput(swapped).competitions[0]!.startAfter).toBeUndefined();
  });

  it('leaves out competitions without a valid format', () => {
    const draft = saturday();
    draft.competitions[0]!.entryCount = 1;
    expect(toPlanInput(draft).competitions).toHaveLength(2);
  });
});
