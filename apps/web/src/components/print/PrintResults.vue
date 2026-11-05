<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { placementRows, resultRows } from '../../lib/printData.js';

const props = defineProps<{ states: CompetitionStateInfo[] }>();
const { t: rawT } = useI18n();
const t = rawT as Translate;

const sections = computed(() =>
  props.states.map((state) => ({ state, placements: placementRows(t, [state]), results: resultRows(t, [state]) })),
);
</script>

<template>
  <section v-for="s in sections" :key="s.state.competition.id" class="print-competition">
    <h2>{{ s.state.competition.name }}</h2>
    <template v-if="s.placements.length > 0">
      <h3>{{ t('print.results.placements') }}</h3>
      <table class="data-table print-table">
        <tbody>
          <tr v-for="(row, i) in s.placements" :key="i">
            <td class="num print-place">{{ row.place }}</td>
            <th scope="row">{{ row.name }}</th>
            <td>{{ row.clubs }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <template v-if="s.results.length > 0">
      <h3>{{ t('print.results.matches') }}</h3>
      <table class="data-table print-table">
        <tbody>
          <tr v-for="(row, i) in s.results" :key="i">
            <td>{{ row.label }}</td>
            <td>{{ row.sides[0] }} – {{ row.sides[1] }}</td>
            <td class="num"><strong>{{ row.score }}</strong></td>
            <td class="muted">{{ row.games }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
