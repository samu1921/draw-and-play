<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import type { Forecast } from '../../lib/api.js';
import { formatClock } from '../../lib/time.js';

const props = defineProps<{ forecast: Forecast | null; day: string | null; selectable?: boolean }>();
const emit = defineEmits<{ 'update:day': [day: string | null] }>();
const { t, d } = useI18n();
const live = injectLiveEvent();
const competitionOf = (id: string) => live.overview.value?.competitions.find((c) => c.id === id);
const rows = computed(() => props.forecast?.competitions ?? []);
</script>

<template>
  <section v-if="forecast" class="card" aria-labelledby="forecast-title">
    <div class="card-header">
      <h2 id="forecast-title">{{ t('forecast.title') }}</h2>
      <label v-if="selectable && forecast.days.length > 1" class="field inline">
        <span>{{ t('forecast.day') }}</span>
        <select :value="day ?? forecast.day ?? ''" @change="emit('update:day', ($event.target as HTMLSelectElement).value || null)">
          <option v-for="option in forecast.days" :key="option" :value="option">{{ d(new Date(option + 'T12:00:00'), { weekday: 'long', day: 'numeric', month: 'long' }) }}</option>
        </select>
      </label>
    </div>
    <p class="muted small">
      {{ forecast.live ? t('forecast.live', { time: formatClock(forecast.now) }) : t('forecast.planned', { time: formatClock(forecast.now) }) }}
    </p>
    <p v-if="rows.length === 0" class="muted">{{ t('forecast.nothing') }}</p>
    <template v-else>
      <dl v-if="forecast.end !== null" class="headline">
        <div>
          <dt>{{ t('forecast.dayEnd') }}</dt>
          <dd>{{ formatClock(forecast.end) }} – {{ formatClock(forecast.endLate ?? forecast.end) }}</dd>
        </div>
      </dl>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">{{ t('planner.forecast.competition') }}</th>
              <th scope="col" class="num">{{ t('forecast.groupsDone') }}</th>
              <th scope="col" class="num">{{ t('forecast.end') }}</th>
              <th scope="col" class="num">{{ t('forecast.perMatch') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <th scope="row">
                <span class="swatch" :style="{ background: `var(--series-${(competitionOf(row.id)?.color ?? 0) + 1})` }" aria-hidden="true"></span>
                {{ competitionOf(row.id)?.name }}
              </th>
              <td class="num">{{ row.groupStageEnd !== null ? formatClock(row.groupStageEnd) : '—' }}</td>
              <td class="num">{{ formatClock(row.end) }} – {{ formatClock(row.endLate) }}</td>
              <td class="num">{{ t('forecast.minutes', { n: row.matchMinutes }) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
