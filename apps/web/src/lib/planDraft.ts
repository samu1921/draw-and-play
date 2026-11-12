import {
  DEFAULT_SPORT,
  generateVariants,
  sportProfiles,
  type CompetitionPlan,
  type FormatVariant,
  type PlanInput,
} from '@draw-and-play/domain';
import { defaultFormatForm, formatSettings, type FormatForm } from './formatForm.js';
import { parseClock } from './time.js';

/** The planner works without an event, so it plans with the default sport. */
export const plannerSport = sportProfiles[DEFAULT_SPORT];

/** Number of fixed color slots; also the maximum number of competitions per day */
export const MAX_COMPETITIONS = 8;

export interface DayDraft {
  tableCount: number;
  /** "HH:MM" */
  start: string;
  minRestMin: number;
  bufferPercent: number;
  bufferMinutes: number;
}

export interface CompetitionDraft extends FormatForm {
  id: string;
  name: string;
  /** Fixed categorical color slot (0–7), assigned once so colors never shift */
  color: number;
  entryCount: number;
  gamesToWin: number;
  matchMinutes: number;
  /** Id of a variant from `generateVariants`, e.g. "g3-top2" */
  variantId: string;
  /** "HH:MM" or empty */
  earliestStart: string;
  /** Id of an earlier competition that must finish first, or empty */
  startAfter: string;
  /** Table range (1-based, inclusive); both null = all tables */
  tableFrom: number | null;
  tableTo: number | null;
}

export interface PlannerDraft {
  day: DayDraft;
  competitions: CompetitionDraft[];
}

export const tableNames = (count: number) => Array.from({ length: count }, (_, i) => String(i + 1));

/** Form fields may be empty ('') while the user types */
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

export function variantsFor(c: Pick<CompetitionDraft, 'entryCount'> & Partial<FormatForm>): FormatVariant[] {
  // The planner does not know whether the entries are pairs or single players, so it offers rotating partners as well.
  return generateVariants(c.entryCount, { ...formatSettings(c), rotation: 'include' });
}

/** The chosen variant, or the first available one if it no longer fits the number of entries */
export function resolveVariant(c: Pick<CompetitionDraft, 'entryCount' | 'variantId'> & Partial<FormatForm>): FormatVariant | undefined {
  const variants = variantsFor(c);
  return variants.find((v) => v.id === c.variantId) ?? variants[0];
}

export function allowedTables(c: CompetitionDraft, tableCount: number): string[] | undefined {
  if (c.tableFrom === null && c.tableTo === null) return undefined;
  const from = Math.max(1, Math.min(c.tableFrom ?? 1, tableCount));
  const to = Math.max(from, Math.min(c.tableTo ?? tableCount, tableCount));
  return tableNames(tableCount).slice(from - 1, to);
}

/** Converts the planner form into the domain's plan input. Competitions without a valid format are left out. */
export function toPlanInput(draft: PlannerDraft): PlanInput {
  const tableCount = isCount(draft.day.tableCount) ? draft.day.tableCount : 1;
  const included = new Set<string>();
  const competitions: CompetitionPlan[] = [];
  for (const c of draft.competitions) {
    if (!isCount(c.entryCount) || !isCount(c.matchMinutes)) continue;
    const variant = resolveVariant(c);
    if (!variant) continue;
    const earliest = parseClock(c.earliestStart);
    const tables = allowedTables(c, tableCount);
    competitions.push({
      id: c.id,
      entryCount: c.entryCount,
      format: variant.format,
      matchMinutes: c.matchMinutes,
      ...(earliest !== null && { earliestStart: earliest }),
      ...(c.startAfter && included.has(c.startAfter) && { startAfter: [c.startAfter] }),
      ...(tables && { tables }),
    });
    included.add(c.id);
  }
  return {
    competitions,
    tables: tableNames(tableCount),
    startMin: parseClock(draft.day.start) ?? 600,
    minRestMin: Number(draft.day.minRestMin) || 0,
    buffer: { percent: Number(draft.day.bufferPercent) || 0, minutes: Number(draft.day.bufferMinutes) || 0 },
  };
}

/** Smallest color slot not yet taken */
export function nextColor(competitions: readonly CompetitionDraft[]): number {
  const used = new Set(competitions.map((c) => c.color));
  for (let slot = 0; slot < MAX_COMPETITIONS; slot++) if (!used.has(slot)) return slot;
  return MAX_COMPETITIONS - 1;
}

let counter = 0;
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

export function createCompetition(
  existing: readonly CompetitionDraft[],
  values: Partial<Omit<CompetitionDraft, 'id' | 'color'>> & { name: string },
): CompetitionDraft {
  const gamesToWin = values.gamesToWin ?? plannerSport.defaultMatchRules.gamesToWin;
  const draft: CompetitionDraft = {
    entryCount: 8,
    matchMinutes: plannerSport.estimateMatchMinutes({ ...plannerSport.defaultMatchRules, gamesToWin }),
    variantId: '',
    ...defaultFormatForm(),
    earliestStart: '',
    startAfter: '',
    tableFrom: null,
    tableTo: null,
    ...values,
    gamesToWin,
    id: newId(),
    color: nextColor(existing),
  };
  return { ...draft, variantId: resolveVariant(draft)?.id ?? '' };
}

/** A fresh planner: one tournament day with four tables, no competitions yet */
export function emptyDraft(): PlannerDraft {
  return { day: { tableCount: 4, start: '10:00', minRestMin: 0, bufferPercent: 10, bufferMinutes: 0 }, competitions: [] };
}
