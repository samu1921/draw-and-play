<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PlacementRow } from '../../lib/printData.js';

defineProps<{ rows: PlacementRow[]; eventName: string; date: string }>();
const { t } = useI18n();
</script>

<template>
  <div class="certificates">
    <article v-for="(row, i) in rows" :key="i" class="certificate">
      <p class="certificate-event">{{ eventName }}</p>
      <h2 class="certificate-title">{{ t('print.certificate.title') }}</h2>
      <p class="certificate-name">{{ row.name }}</p>
      <p v-if="row.clubs" class="certificate-club">{{ row.clubs }}</p>
      <p class="certificate-place">{{ t('print.certificate.place', { n: row.placeNumber }) }}</p>
      <p class="certificate-competition">{{ t('print.certificate.in') }} {{ row.competition }}</p>
      <p class="certificate-date">{{ date }}</p>
    </article>
  </div>
</template>
