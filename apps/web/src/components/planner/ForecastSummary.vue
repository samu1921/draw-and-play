<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { describeFormat, rangeText } from '../../lib/describe.js';
import { resolveVariant } from '../../lib/planDraft.js';
import { formatClock, formatDuration } from '../../lib/time.js';
import { usePlannerStore } from '../../stores/planner.js';

const { t, n } = useI18n();
const store = usePlannerStore();

const rows = computed(() =>
  (store.plan?.competitions ?? []).map((forecast) => {
    const draft = store.byId.get(forecast.id)!;
    const variant = resolveVariant(draft);
    return { forecast, draft, format: variant ? describeFormat(t, variant.format, draft.entryCount) : '' };
  }),
);
const unscheduled = computed(() => (store.plan?.competitions ?? []).reduce((sum, c) => sum + c.unscheduled, 0));
</script>

<template>
  <section class="card" aria-labelledby="forecast-title">
    <h2 id="forecast-title">{{ t('planner.forecast.title') }}</h2>
    <p v-if="!store.plan" class="muted">{{ t('planner.forecast.empty') }}</p>
    <template v-else>
      <dl class="headline">
        <div>
          <dt>{{ t('planner.forecast.dayEnd') }}</dt>
          <dd>{{ formatClock(store.plan.end) }} – {{ formatClock(store.plan.endLate) }}</dd>
        </div>
        <div>
          <dt>{{ t('planner.forecast.utilization') }}</dt>
          <dd>{{ n(store.plan.tableUtilization, { style: 'percent' }) }}</dd>
        </div>
      </dl>
      <p v-if="unscheduled > 0" class="warning-text" role="alert">
        {{ t('planner.forecast.unscheduled', { n: unscheduled }) }}
      </p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">{{ t('planner.forecast.competition') }}</th>
              <th scope="col">{{ t('planner.forecast.format') }}</th>
              <th scope="col" class="num">{{ t('planner.forecast.matches') }}</th>
              <th scope="col" class="num">{{ t('planner.forecast.perEntry') }}</th>
              <th scope="col" class="num">{{ t('planner.forecast.start') }}</th>
              <th scope="col" class="num">{{ t('planner.forecast.groupStageEnd') }}</th>
              <th scope="col" class="num">{{ t('planner.forecast.end') }}</th>
              <th scope="col" class="num">{{ t('planner.forecast.longestWait') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ forecast, draft, format } in rows" :key="forecast.id">
              <th scope="row">
                <span class="swatch" :style="{ background: `var(--series-${draft.color + 1})` }" aria-hidden="true"></span>
                {{ draft.name }}
              </th>
              <td>{{ format }}</td>
              <td class="num">{{ forecast.matchCount }}</td>
              <td class="num">{{ rangeText(forecast.matchesPerEntry) }}</td>
              <td class="num">{{ formatClock(forecast.start) }}</td>
              <td class="num">{{ forecast.groupStageEnd !== undefined ? formatClock(forecast.groupStageEnd) : '—' }}</td>
              <td class="num">{{ formatClock(forecast.end) }} – {{ formatClock(forecast.endLate) }}</td>
              <td class="num">{{ formatDuration(forecast.longestWaitMin) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
