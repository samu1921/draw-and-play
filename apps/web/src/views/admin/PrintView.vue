<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import PrintCertificates from '../../components/print/PrintCertificates.vue';
import PrintCompetitions from '../../components/print/PrintCompetitions.vue';
import PrintResults from '../../components/print/PrintResults.vue';
import PrintSchedule from '../../components/print/PrintSchedule.vue';
import PrintScoresheets from '../../components/print/PrintScoresheets.vue';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type CompetitionStateInfo, type Forecast } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';
import { certificates, scheduleOverview, scheduleRows, scoresheets, type ScoresheetScope } from '../../lib/printData.js';
import { formatClock } from '../../lib/time.js';

type PrintKind = 'scoresheets' | 'schedule' | 'competitions' | 'results' | 'certificates';

const { t: rawT, te, d } = useI18n();
const t = rawT as Translate;
const route = useRoute();
const eventId = computed(() => route.params.eventId as string);
const kind = computed(() => route.params.kind as PrintKind);
const live = useLiveEvent(eventId);
const overview = computed(() => live.overview.value);

const competitionId = computed(() => (typeof route.query.competition === 'string' ? route.query.competition : ''));
const scope = computed<ScoresheetScope>(() => (['called', 'ready', 'open'].includes(route.query.scope as string) ? (route.query.scope as ScoresheetScope) : 'called'));
const maxPlace = computed(() => Math.min(16, Math.max(1, Number(route.query.places) || 3)));
const day = computed(() => (typeof route.query.day === 'string' ? route.query.day : ''));

/** Drawn competitions of the selection; the schedule also needs the names of the others */
const selected = computed(() => (overview.value?.competitions ?? []).filter((c) => !competitionId.value || c.id === competitionId.value));
const states = ref<CompetitionStateInfo[] | null>(null);
const forecast = ref<Forecast | null>(null);
const error = ref('');

// A print page is a snapshot: it loads once per selection, not on every live change. Answers to an older
// selection are dropped.
let request = 0;
watch(
  () => (overview.value ? `${selected.value.filter((c) => c.drawn).map((c) => c.id).join(',')}|${kind.value}|${day.value}` : null),
  async (key) => {
    if (key === null || !overview.value) return;
    const current = ++request;
    error.value = '';
    try {
      const drawn = selected.value.filter((c) => c.drawn);
      const query = day.value ? `?day=${day.value}` : '';
      const [loaded, planned] = await Promise.all([
        Promise.all(drawn.map((c) => api<CompetitionStateInfo>('GET', `/api/competitions/${c.id}/state`))),
        kind.value === 'schedule' ? api<Forecast>('GET', `/api/events/${encodeURIComponent(overview.value.event.slug)}/forecast${query}`) : null,
      ]);
      if (current !== request) return;
      forecast.value = planned;
      states.value = loaded;
    } catch (e) {
      if (current === request) error.value = errorText(t, te, e);
    }
  },
  { immediate: true },
);

const print = () => window.print();
const tableName = (id: string) => overview.value?.tables.find((x) => x.id === id)?.name;
const competitionName = (id: string) => overview.value?.competitions.find((c) => c.id === id)?.name ?? '';
const selectedIds = computed(() => new Set(selected.value.map((c) => c.id)));

const sheets = computed(() => (states.value ? scoresheets(t, states.value, scope.value, tableName) : []));
const scheduleForecast = computed(() => {
  const f = forecast.value;
  if (!f) return null;
  // Only the chosen competition, if there is one
  return { ...f, competitions: f.competitions.filter((c) => selectedIds.value.has(c.id)), matches: f.matches.filter((m) => selectedIds.value.has(m.competitionId)) };
});
const certificateRows = computed(() => (states.value ? certificates(t, states.value, maxPlace.value) : []));
const eventDate = computed(() => {
  const value = overview.value?.event.startsOn;
  // Noon, so the date stays the same in every time zone
  return value ? d(new Date(`${value}T12:00:00`)) : d(new Date());
});

const title = computed(() => {
  const base = t(`print.titles.${kind.value}`);
  const day = scheduleForecast.value?.day;
  return kind.value === 'schedule' && day ? `${base} · ${d(new Date(`${day}T12:00:00`))}` : base;
});
const empty = computed(() => {
  if (!states.value) return false;
  if (kind.value === 'scoresheets') return sheets.value.length === 0;
  if (kind.value === 'certificates') return certificateRows.value.length === 0;
  if (kind.value === 'schedule') return !scheduleForecast.value || scheduleForecast.value.competitions.length === 0;
  return states.value.length === 0;
});
</script>

<template>
  <div class="print-page" :class="`print-${kind}`">
    <header class="print-head no-print">
      <h1>{{ title }}</h1>
      <p class="muted">{{ t('print.hint') }}</p>
      <button type="button" class="button" :disabled="!states || empty" @click="print">{{ t('print.print') }}</button>
    </header>
    <header v-if="overview && kind !== 'scoresheets' && kind !== 'certificates'" class="print-title">
      <p class="muted">{{ overview.event.name }}</p>
      <h1>{{ title }}</h1>
    </header>

    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    <p v-else-if="!states" class="muted">{{ t('common.loading') }}</p>
    <p v-else-if="empty" class="muted print-empty">{{ kind === 'schedule' ? t('print.schedule.none') : t('print.nothing') }}</p>

    <template v-else-if="overview">
      <PrintScoresheets v-if="kind === 'scoresheets'" :sheets="sheets" :event-name="overview.event.name" />
      <PrintSchedule
        v-else-if="kind === 'schedule' && scheduleForecast"
        :overview="scheduleOverview(scheduleForecast, competitionName)"
        :rows="scheduleRows(t, scheduleForecast, states, tableName)"
        :as-of="formatClock(scheduleForecast.now)"
      />
      <PrintCompetitions v-else-if="kind === 'competitions'" :states="states" />
      <PrintResults v-else-if="kind === 'results'" :states="states" />
      <PrintCertificates v-else-if="kind === 'certificates'" :rows="certificateRows" :event-name="overview.event.name" :date="eventDate" />
    </template>
  </div>
</template>
