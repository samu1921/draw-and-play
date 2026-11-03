import { compareVariants, simulatePlan, tableTennis } from '@draw-and-play/domain';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { i18n } from '../i18n/index.js';
import {
  createCompetition,
  emptyDraft,
  MAX_COMPETITIONS,
  resolveVariant,
  toPlanInput,
  variantsFor,
  type CompetitionDraft,
  type PlannerDraft,
} from '../lib/planDraft.js';

// v2: drafts saved by earlier versions contained the example day and are ignored.
const STORAGE_KEY = 'draw-and-play.planner.v2';

function load(): PlannerDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlannerDraft;
    return parsed && typeof parsed.day === 'object' && Array.isArray(parsed.competitions) ? parsed : null;
  } catch {
    return null;
  }
}

function save(draft: PlannerDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked: the draft lives for this page view only.
  }
}

/** Clamps a numeric form field in place. An empty field stays empty while the user is typing. */
function clampField<T extends object>(target: T, key: keyof T, min: number, max: number, fallback: number) {
  const value = target[key] as unknown;
  if (value === '') return;
  const n = typeof value === 'number' ? value : Number(value);
  (target[key] as unknown) = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** Table range fields: empty means "no limit". */
function tableField(c: CompetitionDraft, key: 'tableFrom' | 'tableTo', tableCount: number) {
  const value = c[key] as unknown;
  if (value === null || value === '' || value === undefined) c[key] = null;
  else clampField(c, key, 1, Math.max(1, tableCount), 1);
}

/** Keeps form values in range and the chosen format valid for the entry count. */
function sanitize(draft: PlannerDraft) {
  const day = draft.day;
  clampField(day, 'tableCount', 1, 64, 4);
  clampField(day, 'minRestMin', 0, 120, 0);
  clampField(day, 'bufferPercent', 0, 100, 0);
  clampField(day, 'bufferMinutes', 0, 240, 0);
  const ids = new Set<string>();
  for (const c of draft.competitions) {
    clampField(c, 'entryCount', 1, 128, 8);
    clampField(c, 'gamesToWin', 1, 7, 3);
    clampField(c, 'matchMinutes', 5, 240, 30);
    tableField(c, 'tableFrom', day.tableCount);
    tableField(c, 'tableTo', day.tableCount);
    if (c.startAfter && !ids.has(c.startAfter)) c.startAfter = '';
    const variant = resolveVariant(c);
    if (variant && variant.id !== c.variantId) c.variantId = variant.id;
    ids.add(c.id);
  }
}

export const usePlannerStore = defineStore('planner', () => {
  const draft = ref<PlannerDraft>(load() ?? emptyDraft());
  const selectedId = ref(draft.value.competitions[0]?.id ?? '');

  watch(
    draft,
    (value) => {
      sanitize(value);
      save(value);
    },
    { deep: true, immediate: true },
  );

  const planInput = computed(() => toPlanInput(draft.value));
  const tables = computed(() => planInput.value.tables);
  const plan = computed(() => (planInput.value.competitions.length > 0 ? simulatePlan(planInput.value) : null));
  const selected = computed(() => draft.value.competitions.find((c) => c.id === selectedId.value));
  const comparison = computed(() => {
    const c = selected.value;
    if (!c || !planInput.value.competitions.some((p) => p.id === c.id)) return [];
    return compareVariants(planInput.value, c.id, variantsFor(c));
  });
  const canAdd = computed(() => draft.value.competitions.length < MAX_COMPETITIONS);
  const byId = computed(() => new Map(draft.value.competitions.map((c) => [c.id, c])));

  function addCompetition() {
    if (!canAdd.value) return;
    const list = draft.value.competitions;
    const c = createCompetition(list, {
      name: i18n.global.t('planner.competitions.newName', { n: list.length + 1 }),
    });
    list.push(c);
    selectedId.value = c.id;
  }

  function removeCompetition(id: string) {
    const list = draft.value.competitions;
    draft.value.competitions = list.filter((c) => c.id !== id);
    for (const c of draft.value.competitions) if (c.startAfter === id) c.startAfter = '';
    if (selectedId.value === id) selectedId.value = draft.value.competitions[0]?.id ?? '';
  }

  /** Changing the scoring also updates the estimated match duration. */
  function setGamesToWin(c: CompetitionDraft, gamesToWin: number) {
    c.gamesToWin = gamesToWin;
    c.matchMinutes = tableTennis.estimateMatchMinutes({ ...tableTennis.defaultMatchRules, gamesToWin });
  }

  function applyVariant(competitionId: string, variantId: string) {
    const c = byId.value.get(competitionId);
    if (c) c.variantId = variantId;
  }

  return {
    draft,
    selectedId,
    selected,
    plan,
    tables,
    comparison,
    canAdd,
    byId,
    addCompetition,
    removeCompetition,
    setGamesToWin,
    applyVariant,
  };
});
