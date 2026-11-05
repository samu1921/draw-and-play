<script setup lang="ts">
import { Calculator, CircleCheck, Circle, ListChecks, Monitor, Play, Printer, Trophy, Users } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ForecastPanel from '../../components/live/ForecastPanel.vue';
import { useForecast } from '../../composables/useForecast.js';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type PersonInfo } from '../../lib/api.js';
import { formatClock } from '../../lib/time.js';
import { useSessionStore } from '../../stores/session.js';

const { t } = useI18n();
const live = injectLiveEvent();
const session = useSessionStore();
const overview = computed(() => live.overview.value!);
const event = computed(() => overview.value.event);
const base = computed(() => `/admin/events/${event.value.id}`);
const ops = computed(() => live.operations.value);

// The player count only feeds the checklist; reloaded when the event changes
const personCount = ref<number | null>(null);
async function loadPersons() {
  personCount.value = (await api<{ persons: PersonInfo[] }>('GET', `/api/events/${event.value.id}/persons`).catch(() => null))?.persons.length ?? null;
}
watch(() => event.value.id, () => void loadPersons(), { immediate: true });
live.onChange(() => void loadPersons());

const forecastDay = ref<string | null>(null);
const { forecast } = useForecast(forecastDay);

const anyDrawn = computed(() => overview.value.competitions.some((c) => c.drawn));
const busyTables = computed(() => (ops.value?.tables ?? []).filter((table) => table.match).length);
const readyCount = computed(() => (ops.value?.queue ?? []).filter((m) => m.status === 'ready' && !m.busy).length);
const started = computed(() => busyTables.value > 0 || (ops.value?.recent.length ?? 0) > 0);

interface Step {
  key: string;
  done: boolean;
  label: string;
  to: string;
}

/** What a tournament needs before the first match, in the order it is usually done */
const steps = computed<Step[]>(() => {
  const competitions = overview.value.competitions;
  const list: (Step & { adminOnly?: boolean })[] = [
    { key: 'tables', done: overview.value.tables.length > 0, label: t('admin.dashboard.steps.tables', { n: overview.value.tables.length }), to: `${base.value}/settings`, adminOnly: true },
    { key: 'persons', done: (personCount.value ?? 0) > 0, label: t('admin.dashboard.steps.persons', { n: personCount.value ?? 0 }), to: `${base.value}/persons` },
    { key: 'competitions', done: competitions.length > 0, label: t('admin.dashboard.steps.competitions', { n: competitions.length }), to: `${base.value}/competitions` },
    {
      key: 'drawn',
      done: competitions.length > 0 && competitions.every((c) => c.drawn),
      label: t('admin.dashboard.steps.drawn', { drawn: competitions.filter((c) => c.drawn).length, total: competitions.length }),
      to: `${base.value}/competitions`,
    },
    { key: 'pin', done: event.value.pinEnabled, label: t('admin.dashboard.steps.pin'), to: `${base.value}/settings`, adminOnly: true },
    { key: 'started', done: started.value, label: t('admin.dashboard.steps.started'), to: `${base.value}/desk`, adminOnly: true },
  ];
  return list.filter((s) => session.isAdmin || !s.adminOnly);
});
const openSteps = computed(() => steps.value.filter((s) => !s.done).length);
</script>

<template>
  <div class="stack">
    <!-- The day at a glance: what runs now and when it will end -->
    <section v-if="anyDrawn" class="stat-row" :aria-label="t('admin.dashboard.now')">
      <RouterLink :to="session.isAdmin ? `${base}/desk` : base" class="stat-tile">
        <span class="stat-label">{{ t('admin.dashboard.tablesBusy') }}</span>
        <span class="stat-value">{{ busyTables }} / {{ ops?.tables.length ?? overview.tables.length }}</span>
      </RouterLink>
      <RouterLink :to="session.isAdmin ? `${base}/desk` : base" class="stat-tile">
        <span class="stat-label">{{ t('admin.dashboard.ready') }}</span>
        <span class="stat-value">{{ readyCount }}</span>
        <span class="stat-sub muted small">{{ t('admin.dashboard.queued', { n: ops?.queue.length ?? 0 }) }}</span>
      </RouterLink>
      <div class="stat-tile">
        <span class="stat-label">{{ t('forecast.dayEnd') }}</span>
        <span class="stat-value">{{ forecast?.end != null ? formatClock(forecast.end) : '—' }}</span>
        <span v-if="forecast?.endLate != null" class="stat-sub muted small">{{ t('admin.dashboard.latest', { time: formatClock(forecast.endLate) }) }}</span>
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="card" aria-labelledby="steps-title">
        <div class="card-header">
          <h2 id="steps-title"><ListChecks aria-hidden="true" />{{ t('admin.dashboard.stepsTitle') }}</h2>
          <span class="muted small">{{ openSteps === 0 ? t('admin.dashboard.allDone') : t('admin.dashboard.open', { n: openSteps }) }}</span>
        </div>
        <ol class="checklist">
          <li v-for="s in steps" :key="s.key" :class="{ done: s.done }">
            <CircleCheck v-if="s.done" class="check-icon" aria-hidden="true" />
            <Circle v-else class="check-icon" aria-hidden="true" />
            <RouterLink :to="s.to" class="plain-link">{{ s.label }}</RouterLink>
            <span class="visually-hidden">{{ s.done ? t('admin.dashboard.done') : t('admin.dashboard.todo') }}</span>
          </li>
        </ol>
      </section>

      <section class="card" aria-labelledby="competitions-title">
        <div class="card-header">
          <h2 id="competitions-title"><Trophy aria-hidden="true" />{{ t('admin.tabs.competitions') }}</h2>
          <RouterLink :to="`${base}/competitions`" class="small">{{ t('admin.dashboard.manage') }}</RouterLink>
        </div>
        <p v-if="overview.competitions.length === 0" class="muted">{{ t('admin.dashboard.noCompetitions') }}</p>
        <ul v-else class="link-list">
          <li v-for="c in overview.competitions" :key="c.id">
            <span class="swatch" :style="{ background: `var(--series-${c.color + 1})` }" aria-hidden="true"></span>
            <RouterLink :to="`${base}/competitions/${c.id}`">{{ c.name }}</RouterLink>
            <span class="badge" :class="{ quiet: !c.drawn }">{{ c.drawn ? t('admin.competitions.drawn') : t('admin.dashboard.notDrawn') }}</span>
          </li>
        </ul>
      </section>
    </div>

    <nav class="quick-actions" :aria-label="t('admin.dashboard.quick')">
      <RouterLink v-if="session.isAdmin" :to="`${base}/desk`" class="button"><Play aria-hidden="true" />{{ t('admin.dashboard.openDesk') }}</RouterLink>
      <RouterLink :to="`${base}/persons`" class="button secondary"><Users aria-hidden="true" />{{ t('admin.tabs.persons') }}</RouterLink>
      <RouterLink v-if="session.isAdmin" :to="`${base}/displays`" class="button secondary"><Monitor aria-hidden="true" />{{ t('admin.tabs.displays') }}</RouterLink>
      <RouterLink :to="`${base}/print`" class="button secondary"><Printer aria-hidden="true" />{{ t('admin.tabs.print') }}</RouterLink>
      <RouterLink to="/admin/planner" class="button secondary"><Calculator aria-hidden="true" />{{ t('nav.planner') }}</RouterLink>
    </nav>

    <ForecastPanel v-if="anyDrawn" v-model:day="forecastDay" :forecast="forecast" selectable />
  </div>
</template>
