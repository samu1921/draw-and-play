<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { describeFormat, rangeText } from '../../lib/describe.js';
import { formatClock, formatDuration } from '../../lib/time.js';
import { usePlannerStore } from '../../stores/planner.js';

const { t } = useI18n();
const store = usePlannerStore();

const fastestEnd = computed(() => Math.min(...store.comparison.map((row) => row.forecast.end)));
</script>

<template>
  <section v-if="store.selected && store.comparison.length > 0" class="card" aria-labelledby="variants-title">
    <h2 id="variants-title">
      <span class="swatch" :style="{ background: `var(--series-${store.selected.color + 1})` }" aria-hidden="true"></span>
      {{ t('planner.variants.title', { name: store.selected.name }) }}
    </h2>
    <p class="muted">{{ t('planner.variants.hint') }}</p>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">{{ t('planner.forecast.format') }}</th>
            <th scope="col" class="num">{{ t('planner.forecast.matches') }}</th>
            <th scope="col" class="num">{{ t('planner.forecast.perEntry') }}</th>
            <th scope="col" class="num">{{ t('planner.forecast.groupStageEnd') }}</th>
            <th scope="col" class="num">{{ t('planner.forecast.end') }}</th>
            <th scope="col" class="num">{{ t('planner.forecast.longestWait') }}</th>
            <th scope="col" class="num">{{ t('planner.forecast.dayEnd') }}</th>
            <th scope="col"><span class="visually-hidden">{{ t('planner.variants.apply') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in store.comparison"
            :key="row.variant.id"
            :class="{ current: row.variant.id === store.selected.variantId }"
          >
            <th scope="row">
              {{ describeFormat(t, row.variant.format, store.selected.entryCount) }}
              <span v-if="row.forecast.end === fastestEnd" class="badge">{{ t('planner.variants.fastest') }}</span>
            </th>
            <td class="num">{{ row.forecast.matchCount }}</td>
            <td class="num">{{ rangeText(row.forecast.matchesPerEntry) }}</td>
            <td class="num">{{ row.forecast.groupStageEnd !== undefined ? formatClock(row.forecast.groupStageEnd) : '—' }}</td>
            <td class="num">{{ formatClock(row.forecast.end) }} – {{ formatClock(row.forecast.endLate) }}</td>
            <td class="num">{{ formatDuration(row.forecast.longestWaitMin) }}</td>
            <td class="num">{{ formatClock(row.planEnd) }}</td>
            <td>
              <span v-if="row.variant.id === store.selected.variantId" class="muted">{{ t('planner.variants.current') }}</span>
              <button v-else type="button" class="button secondary small" @click="store.applyVariant(store.selected.id, row.variant.id)">
                {{ t('planner.variants.apply') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
