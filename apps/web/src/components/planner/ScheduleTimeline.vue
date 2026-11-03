<script setup lang="ts">
import type { PlannedMatch } from '@draw-and-play/domain';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { matchLabel } from '../../lib/describe.js';
import { formatClock } from '../../lib/time.js';
import { usePlannerStore } from '../../stores/planner.js';

const { t } = useI18n();
const store = usePlannerStore();
const view = ref<'chart' | 'list'>('chart');

/** Slot 4 (yellow) needs dark ink for its labels, all other fills take white */
const DARK_INK_SLOT = 3;

const range = computed(() => {
  const plan = store.plan;
  if (!plan || plan.matches.length === 0) return null;
  const from = Math.floor(Math.min(...plan.matches.map((m) => m.start)) / 60) * 60;
  const to = Math.ceil(plan.endLate / 60) * 60;
  const step = to - from > 10 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let tick = from; tick <= to; tick += step) ticks.push(tick);
  return { from, to, ticks, end: plan.end, endLate: plan.endLate };
});

const pct = (minutes: number) => {
  const r = range.value!;
  return ((minutes - r.from) / (r.to - r.from)) * 100;
};

const rows = computed(() =>
  store.tables.map((table) => ({ table, matches: (store.plan?.matches ?? []).filter((m) => m.table === table) })),
);
const listed = computed(() => [...(store.plan?.matches ?? [])].sort((a, b) => a.start - b.start || Number(a.table) - Number(b.table)));
const legend = computed(() => (store.plan?.competitions ?? []).map((c) => store.byId.get(c.id)!));
const chartMinWidth = computed(() => (range.value ? Math.max(640, ((range.value.to - range.value.from) / 60) * 110) : 640));

const colorOf = (m: PlannedMatch) => store.byId.get(m.competitionId)?.color ?? 0;
const describe = (m: PlannedMatch) =>
  t('planner.timeline.tooltip', {
    competition: store.byId.get(m.competitionId)?.name ?? '',
    match: matchLabel(t, m.match),
    table: m.table,
    from: formatClock(m.start),
    to: formatClock(m.end),
  });

const hovered = ref<{ text: string; left: number; top: number } | null>(null);
const chart = ref<HTMLElement | null>(null);

function show(m: PlannedMatch, event: Event) {
  const target = event.currentTarget as HTMLElement;
  const box = chart.value!.getBoundingClientRect();
  const bar = target.getBoundingClientRect();
  hovered.value = { text: describe(m), left: bar.left - box.left + bar.width / 2, top: bar.top - box.top };
}
</script>

<template>
  <section v-if="range" class="card" aria-labelledby="timeline-title">
    <div class="card-header">
      <h2 id="timeline-title">{{ t('planner.timeline.title') }}</h2>
      <div class="segmented" role="group" :aria-label="t('planner.timeline.title')">
        <button type="button" :aria-pressed="view === 'chart'" @click="view = 'chart'">{{ t('planner.timeline.viewChart') }}</button>
        <button type="button" :aria-pressed="view === 'list'" @click="view = 'list'">{{ t('planner.timeline.viewList') }}</button>
      </div>
    </div>

    <ul class="legend">
      <li v-for="c in legend" :key="c.id">
        <span class="swatch" :style="{ background: `var(--series-${c.color + 1})` }" aria-hidden="true"></span>{{ c.name }}
      </li>
      <li><span class="swatch buffer-swatch" aria-hidden="true"></span>{{ t('planner.timeline.buffer') }}</li>
    </ul>

    <div v-if="view === 'chart'" class="timeline-scroll">
      <div ref="chart" class="timeline" :style="{ minWidth: `${chartMinWidth}px` }" @pointerleave="hovered = null">
        <div class="timeline-axis">
          <span v-for="tick in range.ticks" :key="tick" class="tick" :style="{ left: `${pct(tick)}%` }">
            {{ formatClock(tick) }}
          </span>
        </div>
        <div v-for="row in rows" :key="row.table" class="timeline-row">
          <div class="timeline-label">{{ t('planner.timeline.table', { name: row.table }) }}</div>
          <div class="timeline-track">
            <span v-for="tick in range.ticks" :key="tick" class="gridline" :style="{ left: `${pct(tick)}%` }"></span>
            <span
              v-if="range.endLate > range.end"
              class="buffer-band"
              :style="{ left: `${pct(range.end)}%`, width: `${pct(range.endLate) - pct(range.end)}%` }"
            ></span>
            <div
              v-for="m in row.matches"
              :key="m.taskId"
              class="bar"
              :class="{ 'ink-dark': colorOf(m) === DARK_INK_SLOT }"
              :style="{
                left: `calc(${pct(m.start)}% + 1px)`,
                width: `calc(${pct(m.end) - pct(m.start)}% - 2px)`,
                background: `var(--series-${colorOf(m) + 1})`,
              }"
              tabindex="0"
              role="img"
              :aria-label="describe(m)"
              @pointerenter="show(m, $event)"
              @focus="show(m, $event)"
              @blur="hovered = null"
            >
              {{ matchLabel(t, m.match, true) }}
            </div>
          </div>
        </div>
        <div
          v-if="hovered"
          class="tooltip"
          :style="{ left: `${hovered.left}px`, top: `${hovered.top}px` }"
          aria-hidden="true"
        >
          {{ hovered.text }}
        </div>
      </div>
    </div>

    <div v-else class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col" class="num">{{ t('planner.timeline.time') }}</th>
            <th scope="col">{{ t('planner.day.tables') }}</th>
            <th scope="col">{{ t('planner.forecast.competition') }}</th>
            <th scope="col">{{ t('planner.timeline.match') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in listed" :key="m.taskId">
            <td class="num">{{ formatClock(m.start) }}–{{ formatClock(m.end) }}</td>
            <td>{{ m.table }}</td>
            <td>
              <span class="swatch" :style="{ background: `var(--series-${colorOf(m) + 1})` }" aria-hidden="true"></span>
              {{ store.byId.get(m.competitionId)?.name }}
            </td>
            <td>{{ matchLabel(t, m.match) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
