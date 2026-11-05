<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ScheduleOverviewRow, ScheduleRow } from '../../lib/printData.js';

defineProps<{ overview: ScheduleOverviewRow[]; rows: ScheduleRow[]; asOf: string }>();
const { t } = useI18n();
</script>

<template>
  <div class="schedule-sheet">
    <p class="muted">{{ t('print.schedule.estimated', { time: asOf }) }}</p>
    <h2>{{ t('print.schedule.overview') }}</h2>
    <table class="data-table print-table">
      <thead>
        <tr>
          <th scope="col">{{ t('print.competition') }}</th>
          <th scope="col" class="num">{{ t('print.schedule.start') }}</th>
          <th scope="col" class="num">{{ t('print.schedule.groupStageEnd') }}</th>
          <th scope="col" class="num">{{ t('print.schedule.end') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in overview" :key="row.competition">
          <th scope="row">{{ row.competition }}</th>
          <td class="num">≈ {{ row.start }}</td>
          <td class="num">{{ row.groupStageEnd ? `≈ ${row.groupStageEnd}` : '' }}</td>
          <td class="num">≈ {{ row.end }}</td>
        </tr>
      </tbody>
    </table>

    <template v-if="rows.length > 0">
      <h2>{{ t('print.schedule.matches') }}</h2>
      <table class="data-table print-table">
        <thead>
          <tr>
            <th scope="col" class="num">{{ t('print.schedule.time') }}</th>
            <th scope="col" class="num">{{ t('print.schedule.table') }}</th>
            <th scope="col">{{ t('print.competition') }}</th>
            <th scope="col">{{ t('print.csv.match') }}</th>
            <th scope="col">{{ t('print.csv.side1') }}</th>
            <th scope="col">{{ t('print.csv.side2') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i">
            <td class="num">≈ {{ row.start }}</td>
            <td class="num">{{ row.table }}</td>
            <td>{{ row.competition }}</td>
            <td>{{ row.label }}</td>
            <td>{{ row.sides[0] }}</td>
            <td>{{ row.sides[1] }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
