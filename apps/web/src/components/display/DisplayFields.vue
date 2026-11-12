<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import type { CompetitionStateInfo } from '../../lib/api.js';
import { placesText } from '../../lib/rules.js';
import { placementGroupViews } from '../../lib/stages.js';

/** Consolation fields of three that play everybody against everybody: the table with its matches below */
const props = defineProps<{
  state: CompetitionStateInfo;
  /** Fields on this slide (`C1`, …) */
  stages: string[];
  tableName?: (tableId: string) => string | undefined;
}>();
const { t } = useI18n();
const { name, sideText, score } = useCompetitionText(() => props.state);

const fields = computed(() => placementGroupViews(props.state).filter((f) => props.stages.includes(f.stage)));
</script>

<template>
  <div class="d-groups" :style="{ gridTemplateColumns: `repeat(${Math.max(1, fields.length)}, minmax(0, 1fr))` }">
    <section v-for="f in fields" :key="f.stage" class="d-group">
      <h3>
        {{ t('public.consolationPlaces', { places: placesText(...f.places) }) }}
        <span v-if="f.group.complete" class="badge">{{ t('public.complete') }}</span>
      </h3>
      <table class="d-table">
        <thead>
          <tr>
            <th class="num">{{ t('public.rank') }}</th>
            <th>{{ t('public.entry') }}</th>
            <th class="num">{{ t('public.played') }}</th>
            <th class="num">{{ t('public.record') }}</th>
            <th class="num">{{ t('public.games') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in f.group.standings" :key="row.entryId">
            <td class="num">{{ f.places[0] + i }}</td>
            <th class="name">
              {{ name(row.entryId) }}<span v-if="row.withdrawn" class="d-withdrawn"> · {{ t('public.withdrawn') }}</span>
            </th>
            <td class="num">{{ row.played }}</td>
            <td class="num">{{ row.won }}:{{ row.lost }}</td>
            <td class="num">{{ row.gamesWon }}:{{ row.gamesLost }}</td>
          </tr>
        </tbody>
      </table>
      <ol class="d-field-matches">
        <li v-for="m in f.matches" :key="m.key">
          <span class="d-pair">
            <span :class="{ winner: m.result?.winner === 0 }">{{ sideText(m, 0) }}</span>
            <span class="muted"> – </span>
            <span :class="{ winner: m.result?.winner === 1 }">{{ sideText(m, 1) }}</span>
          </span>
          <strong v-if="m.status === 'finished'">{{ score(m) }}</strong>
          <span v-else-if="m.status === 'called' && m.tableId">{{ t('table.title', { name: tableName?.(m.tableId) ?? '' }) }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.d-field-matches {
  list-style: none;
  margin: 1.5rem 0 0;
  padding: 0;
  font-size: 1.5rem;
}
.d-field-matches li {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent);
}
.d-pair {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.d-pair .winner {
  font-weight: 700;
}
</style>
