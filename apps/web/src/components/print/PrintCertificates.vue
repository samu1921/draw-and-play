<script setup lang="ts">
import { computed } from 'vue';
import { fillPlaceholders, LINE_KEYS, type CertificateLines, type ResolvedTemplate } from '../../lib/certificate.js';
import type { PlacementRow } from '../../lib/printData.js';
import CertificateSheet from './CertificateSheet.vue';

const props = defineProps<{
  rows: PlacementRow[];
  eventName: string;
  /** The date printed on a row's certificate (its competition's day, else the event's first day) */
  dateOf: (row: PlacementRow) => string;
  template: ResolvedTemplate;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
}>();

const sheets = computed(() =>
  props.rows.map((row) => {
    const values = { name: row.name, club: row.clubs, place: String(row.placeNumber), competition: row.competition, event: props.eventName, date: props.dateOf(row) };
    const lines = Object.fromEntries(LINE_KEYS.map((key) => [key, fillPlaceholders(props.template.lines[key], values).trim()])) as Required<CertificateLines>;
    return { lines, signatures: props.template.signatures.map((s) => fillPlaceholders(s, values)) };
  }),
);
</script>

<template>
  <div class="certificates">
    <CertificateSheet
      v-for="(sheet, i) in sheets"
      :key="i"
      :lines="sheet.lines"
      :signatures="sheet.signatures"
      :mode="template.mode"
      :logo-url="template.showLogo ? logoUrl : null"
      :background-url="backgroundUrl"
    />
  </div>
</template>
