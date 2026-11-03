<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import CompetitionList from '../components/planner/CompetitionList.vue';
import DaySettings from '../components/planner/DaySettings.vue';
import ForecastSummary from '../components/planner/ForecastSummary.vue';
import ScheduleTimeline from '../components/planner/ScheduleTimeline.vue';
import VariantComparison from '../components/planner/VariantComparison.vue';

const { t } = useI18n();
</script>

<template>
  <div class="planner">
    <header class="page-header">
      <div>
        <h1>{{ t('planner.title') }}</h1>
        <p class="intro">{{ t('planner.intro') }}</p>
      </div>
    </header>

    <div class="planner-inputs">
      <DaySettings />
      <CompetitionList />
    </div>
    <ForecastSummary />
    <ScheduleTimeline />
    <VariantComparison />
  </div>
</template>
