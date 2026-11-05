<script setup lang="ts">
import { CheckCheck, Coffee, ListOrdered, Table2, Timer } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ForecastPanel from '../../components/live/ForecastPanel.vue';
import OutboxNotice from '../../components/live/OutboxNotice.vue';
import ResultDialog from '../../components/live/ResultDialog.vue';
import TableCard from '../../components/live/TableCard.vue';
import { useForecast } from '../../composables/useForecast.js';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { useNow } from '../../composables/useNow.js';
import { useResultOutbox } from '../../composables/useResultOutbox.js';
import { api, type OperationsMatch } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';
import { matchRest, restMinutes, SHORT_REST_MINUTES } from '../../lib/rest.js';
import { formatClock, formatDuration } from '../../lib/time.js';

const { t, te } = useI18n();
const live = injectLiveEvent();
const now = useNow();
const outbox = useResultOutbox(
  computed(() => live.overview.value?.event.id),
  live.status,
);
const ops = computed(() => live.operations.value);
const competitions = computed(() => new Map((ops.value?.competitions ?? []).map((c) => [c.id, c])));
const rulesOf = (m: OperationsMatch | null) => live.overview.value?.competitions.find((c) => c.id === m?.competitionId)?.matchRules;

const forecastDay = ref<string | null>(null);
const { forecast } = useForecast(forecastDay);
/** Planned start and table per queued match, from the live forecast */
const planned = computed(() => new Map((forecast.value?.matches ?? []).map((m) => [`${m.competitionId}:${m.matchKey}`, m])));
const plannedOf = (m: OperationsMatch) => planned.value.get(`${m.competitionId}:${m.key}`);
const tableName = (id: string) => ops.value?.tables.find((t) => t.id === id)?.name ?? '';

const error = ref('');
const editing = ref<OperationsMatch | null>(null);
/** Chosen table per queued match */
const chosen = reactive<Record<string, string>>({});

const freeTables = computed(() => (ops.value?.tables ?? []).filter((t) => !t.match));
function tablesFor(m: OperationsMatch) {
  const allowed = live.overview.value?.competitions.find((c) => c.id === m.competitionId)?.tableIds;
  return freeTables.value.filter((t) => !allowed || allowed.includes(t.id));
}

async function run(action: () => Promise<unknown>) {
  error.value = '';
  try {
    await action();
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    await live.reload();
  }
}

/**
 * In the order of the forecast (the suggested next calls); matches with a busy player stay in place, greyed out.
 * Without a forecast, callable matches come first.
 */
/** "forecast": the suggested order; "rest": the longest-rested matches first (the shorter rest of both sides counts) */
const order = ref<'forecast' | 'rest'>('forecast');
const plannedStart = (m: OperationsMatch) => plannedOf(m)?.start ?? Number.MAX_SAFE_INTEGER;
/** Longer rest first; equal rests (e.g. nobody has played) keep the forecast order */
const byRest = (a: OperationsMatch, b: OperationsMatch) => {
  const ra = matchRest(a.sides, now.value);
  const rb = matchRest(b.sides, now.value);
  return ra === rb ? 0 : rb > ra ? 1 : -1;
};
const queue = computed(() =>
  [...(ops.value?.queue ?? [])].sort((a, b) =>
    order.value === 'rest'
      ? Number(a.busy ?? false) - Number(b.busy ?? false) || byRest(a, b) || plannedStart(a) - plannedStart(b)
      : plannedStart(a) - plannedStart(b) || Number(a.busy ?? false) - Number(b.busy ?? false),
  ),
);
const restOf = (since: string | null | undefined) => restMinutes(since, now.value);
const restText = (minutes: number | null) =>
  minutes === null ? t('admin.desk.notPlayed') : minutes < 60 ? t('admin.desk.restMinutes', { n: minutes }) : t('admin.desk.restHours', { time: formatDuration(minutes) });
/** The table picked by hand, else the one the forecast suggests, else the first free one */
const selectedTable = (m: OperationsMatch) => {
  const options = tablesFor(m);
  if (options.some((t) => t.id === chosen[m.id])) return chosen[m.id]!;
  const suggested = plannedOf(m)?.tableId;
  return options.some((t) => t.id === suggested) ? suggested! : (options[0]?.id ?? '');
};

const call = (m: OperationsMatch) => {
  const tableId = selectedTable(m);
  if (tableId) void run(() => api('POST', `/api/matches/${m.id}/call`, { tableId, version: m.version }));
};
const uncall = (m: OperationsMatch) => run(() => api('POST', `/api/matches/${m.id}/uncall`, { version: m.version }));
const sideNames = (m: OperationsMatch) => `${m.sides[0]?.name ?? '—'} – ${m.sides[1]?.name ?? '—'}`;
function score(m: OperationsMatch) {
  if (!m.result) return '';
  if (m.result.walkover) return t('public.walkover');
  const won = m.result.games.filter(([a, b]) => a > b).length;
  return `${won}:${m.result.games.length - won}`;
}
async function onSaved() {
  editing.value = null;
  await live.reload();
}
</script>

<template>
  <div v-if="ops" class="desk">
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    <OutboxNotice :waiting="outbox.waiting.value" :refused="outbox.refused.value" @dismiss="outbox.dismiss" />

    <section aria-labelledby="desk-tables">
      <h2 id="desk-tables"><Table2 aria-hidden="true" />{{ t('admin.desk.tables') }}</h2>
      <div class="table-grid">
        <TableCard v-for="table in ops.tables" :key="table.id" :table="table" :competitions="competitions" :now="now">
          <template v-if="table.match">
            <button type="button" class="button small" @click="editing = table.match">{{ t('admin.desk.result') }}</button>
            <button type="button" class="button secondary small" @click="uncall(table.match)">{{ t('admin.desk.uncall') }}</button>
          </template>
        </TableCard>
      </div>
    </section>

    <section class="card" aria-labelledby="desk-queue">
      <div class="card-header">
        <h2 id="desk-queue"><ListOrdered aria-hidden="true" />{{ t('admin.desk.queue') }} ({{ ops.queue.length }})</h2>
        <div v-if="ops.queue.length > 1" class="segmented" role="group" :aria-label="t('admin.desk.order')">
          <button type="button" :aria-pressed="order === 'forecast'" @click="order = 'forecast'">{{ t('admin.desk.orderForecast') }}</button>
          <button type="button" :aria-pressed="order === 'rest'" @click="order = 'rest'">{{ t('admin.desk.orderRest') }}</button>
        </div>
      </div>
      <p v-if="ops.queue.length === 0" class="muted">{{ t('admin.desk.queueEmpty') }}</p>
      <ul v-else class="queue">
        <li v-for="m in queue" :key="m.id" class="queue-item" :class="{ blocked: m.busy }">
          <div class="queue-text">
            <span class="queue-meta">
              <span class="swatch" :style="{ background: `var(--series-${(competitions.get(m.competitionId)?.color ?? 0) + 1})` }" aria-hidden="true"></span>
              {{ competitions.get(m.competitionId)?.name }} · {{ matchLabel(t, m) }}
            </span>
            <span class="queue-players">
              <template v-for="(side, i) in m.sides" :key="i">
                <span v-if="i === 1" class="queue-vs"> – </span>
                <span class="queue-side">
                  {{ side?.name ?? '—' }}
                  <span
                    v-if="side"
                    class="rest"
                    :class="{ short: (restOf(side.restingSince) ?? Infinity) < SHORT_REST_MINUTES }"
                    :title="t('admin.desk.restTitle')"
                  >
                    <Timer v-if="(restOf(side.restingSince) ?? Infinity) < SHORT_REST_MINUTES" aria-hidden="true" />
                    <Coffee v-else aria-hidden="true" />
                    <span class="visually-hidden">{{ t('admin.desk.restTitle') }}:</span>
                    {{ restText(restOf(side.restingSince)) }}
                  </span>
                </span>
              </template>
            </span>
            <span v-if="plannedOf(m)" class="muted small">
              {{ t('forecast.suggested', { time: formatClock(plannedOf(m)!.start), table: tableName(plannedOf(m)!.tableId) }) }}
            </span>
            <span v-if="m.busy" class="busy-note">
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
              {{ t('admin.desk.busy') }}
            </span>
          </div>
          <div class="queue-actions">
            <template v-if="tablesFor(m).length > 0">
              <select :value="selectedTable(m)" :aria-label="t('admin.desk.table')" @change="chosen[m.id] = ($event.target as HTMLSelectElement).value">
                <option v-for="table in tablesFor(m)" :key="table.id" :value="table.id">{{ t('table.title', { name: table.name }) }}</option>
              </select>
              <button type="button" class="button small" :disabled="m.busy" @click="call(m)">{{ t('admin.desk.call') }}</button>
            </template>
            <span v-else class="muted small">{{ t('admin.desk.noFreeTable') }}</span>
            <button type="button" class="button secondary small" @click="editing = m">{{ t('admin.desk.result') }}</button>
          </div>
        </li>
      </ul>
    </section>

    <ForecastPanel v-model:day="forecastDay" :forecast="forecast" selectable />

    <section v-if="ops.recent.length > 0" class="card" aria-labelledby="desk-recent">
      <h2 id="desk-recent"><CheckCheck aria-hidden="true" />{{ t('admin.desk.recent') }}</h2>
      <ul class="queue">
        <li v-for="m in ops.recent" :key="m.id" class="queue-item">
          <div class="queue-text">
            <span class="queue-meta">{{ competitions.get(m.competitionId)?.name }} · {{ matchLabel(t, m) }}</span>
            <span class="queue-players">{{ sideNames(m) }} <strong>{{ score(m) }}</strong></span>
          </div>
          <button type="button" class="button secondary small" @click="editing = m">{{ t('admin.desk.correct') }}</button>
        </li>
      </ul>
    </section>

    <ResultDialog
      :match="editing"
      :rules="rulesOf(editing)"
      :sport="live.sport.value"
      :outbox="outbox"
      :competition-name="editing ? competitions.get(editing.competitionId)?.name : undefined"
      allow-walkover @close="editing = null" @saved="onSaved" />
  </div>
</template>
