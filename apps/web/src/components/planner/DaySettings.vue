<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { usePlannerStore } from '../../stores/planner.js';

const { t } = useI18n();
const store = usePlannerStore();
</script>

<template>
  <section class="card" aria-labelledby="day-title">
    <h2 id="day-title">{{ t('planner.day.title') }}</h2>
    <div class="fields">
      <label class="field">
        <span>{{ t('planner.day.tables') }}</span>
        <input v-model.number="store.draft.day.tableCount" type="number" min="1" max="64" inputmode="numeric" />
      </label>
      <label class="field">
        <span>{{ t('planner.day.start') }}</span>
        <input v-model="store.draft.day.start" type="time" step="300" />
      </label>
      <label class="field">
        <span>{{ t('planner.day.minRest') }}</span>
        <input v-model.number="store.draft.day.minRestMin" type="number" min="0" max="120" step="5" inputmode="numeric" />
      </label>
      <label class="field">
        <span>{{ t('planner.day.bufferPercent') }}</span>
        <input v-model.number="store.draft.day.bufferPercent" type="number" min="0" max="100" step="5" inputmode="numeric" />
      </label>
      <label class="field">
        <span>{{ t('planner.day.bufferMinutes') }}</span>
        <input v-model.number="store.draft.day.bufferMinutes" type="number" min="0" max="240" step="5" inputmode="numeric" />
      </label>
    </div>
  </section>
</template>
