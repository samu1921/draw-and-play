<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Scoresheet } from '../../lib/printData.js';

defineProps<{ sheets: Scoresheet[]; eventName: string }>();
const { t } = useI18n();
</script>

<template>
  <div class="scoresheets">
    <article v-for="sheet in sheets" :key="sheet.key" class="scoresheet">
      <header class="scoresheet-head">
        <div>
          <p class="muted small">{{ eventName }}</p>
          <h2>{{ sheet.competition }} · {{ sheet.label }}</h2>
        </div>
        <p class="scoresheet-table">{{ sheet.table ? t('print.sheet.table', { name: sheet.table }) : t('print.sheet.table', { name: '____' }) }}</p>
      </header>
      <table class="scoresheet-grid">
        <thead>
          <tr>
            <th scope="col">{{ t('print.sheet.game') }}</th>
            <th v-for="side in [0, 1] as const" :key="side" scope="col">
              {{ sheet.sides[side] }}
              <span v-if="sheet.clubs[side]" class="muted small">{{ sheet.clubs[side] }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="game in sheet.games" :key="game">
            <th scope="row">{{ game }}</th>
            <td></td>
            <td></td>
          </tr>
          <tr class="scoresheet-total">
            <th scope="row">{{ t('print.sheet.result') }}</th>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <div class="scoresheet-foot">
        <span>{{ t('print.sheet.winner') }}: ______________________</span>
        <span>{{ t('print.sheet.signature') }}: ______________________</span>
      </div>
    </article>
  </div>
</template>
