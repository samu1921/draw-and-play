<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import CompetitionStateView from '../../components/live/CompetitionStateView.vue';
import StreamBadge from '../../components/live/StreamBadge.vue';
import TableCard from '../../components/live/TableCard.vue';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { useNow } from '../../composables/useNow.js';
import { api, type CompetitionStateInfo } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { formatClock } from '../../lib/time.js';

const { t } = useI18n();
const route = useRoute();
const slug = computed(() => route.params.slug as string);
const live = useLiveEvent(slug, { operations: true });
const now = useNow();

// The projector always uses the dark theme: better contrast on weak projectors.
let previousTheme: string | undefined;
onMounted(() => {
  previousTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'dark';
});
onBeforeUnmount(() => {
  if (previousTheme === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = previousTheme;
});

const states = ref<CompetitionStateInfo[]>([]);
async function loadStates() {
  const drawn = live.overview.value?.competitions.filter((c) => c.drawn) ?? [];
  states.value = await Promise.all(drawn.map((c) => api<CompetitionStateInfo>('GET', `/api/competitions/${c.id}/state`)));
}
watch(() => live.overview.value, loadStates);
live.onChange(() => void loadStates());

type Slide = { kind: 'tables' } | { kind: 'next' } | { kind: 'competition'; state: CompetitionStateInfo };
const slides = computed<Slide[]>(() => [{ kind: 'tables' }, { kind: 'next' }, ...states.value.map((state) => ({ kind: 'competition' as const, state }))]);

const pinned = computed(() => (typeof route.query.view === 'string' ? route.query.view : null));
const intervalMs = computed(() => Math.max(5, Number(route.query.interval) || 20) * 1000);
const index = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  intervalMs,
  (ms) => {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!pinned.value) index.value = (index.value + 1) % slides.value.length;
    }, ms);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(timer));

const current = computed<Slide>(() => {
  if (pinned.value === 'tables' || pinned.value === 'next') return { kind: pinned.value };
  return slides.value[index.value % slides.value.length] ?? { kind: 'tables' };
});
const competitions = computed(() => new Map((live.operations.value?.competitions ?? []).map((c) => [c.id, c])));
const next = computed(() => (live.operations.value?.queue ?? []).filter((m) => !m.busy).slice(0, 8));
const tableName = (id: string) => live.overview.value?.tables.find((t) => t.id === id)?.name;
const clock = computed(() => formatClock(new Date(now.value).getHours() * 60 + new Date(now.value).getMinutes()));
</script>

<template>
  <div class="display">
    <header class="display-head">
      <h1>{{ live.overview.value?.event.name }}</h1>
      <div class="display-meta">
        <StreamBadge :status="live.status.value" />
        <span class="display-clock">{{ clock }}</span>
      </div>
    </header>

    <main v-if="live.operations.value" class="display-body">
      <template v-if="current.kind === 'tables'">
        <h2>{{ t('display.tables') }}</h2>
        <div class="table-grid large">
          <TableCard v-for="table in live.operations.value.tables" :key="table.id" :table="table" :competitions="competitions" :now="now" large />
        </div>
      </template>

      <template v-else-if="current.kind === 'next'">
        <h2>{{ t('display.next') }}</h2>
        <ol class="display-next">
          <li v-for="m in next" :key="m.id">
            <span class="swatch" :style="{ background: `var(--series-${(competitions.get(m.competitionId)?.color ?? 0) + 1})` }" aria-hidden="true"></span>
            <span class="display-next-meta">{{ competitions.get(m.competitionId)?.name }} · {{ matchLabel(t, m) }}</span>
            <span class="display-next-players">{{ m.sides[0]?.name }} – {{ m.sides[1]?.name }}</span>
          </li>
        </ol>
      </template>

      <template v-else>
        <h2>
          <span class="swatch" :style="{ background: `var(--series-${current.state.competition.color + 1})` }" aria-hidden="true"></span>
          {{ current.state.competition.name }}
        </h2>
        <CompetitionStateView :state="current.state" display :table-name="tableName" />
      </template>
    </main>

    <footer v-if="!pinned" class="display-dots" aria-hidden="true">
      <span v-for="(_, i) in slides" :key="i" class="dot" :class="{ active: i === index % slides.length }"></span>
    </footer>
  </div>
</template>
