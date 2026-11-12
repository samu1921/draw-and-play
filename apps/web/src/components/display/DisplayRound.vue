<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import type { CompetitionStateInfo } from '../../lib/api.js';

/** The pairings of one round of a Swiss system: who plays whom, where, and the results so far */
const props = defineProps<{
  state: CompetitionStateInfo;
  round: number;
  /** Matches on this slide */
  matchKeys: string[];
  tableName?: (tableId: string) => string | undefined;
}>();
const { t } = useI18n();
const { name, sideText, score } = useCompetitionText(() => props.state);

const matches = computed(() => props.matchKeys.flatMap((key) => props.state.matches.find((m) => m.key === key) ?? []));
const bye = computed(() => props.state.swiss?.paired.find((p) => p.round === props.round)?.bye ?? null);
</script>

<template>
  <div class="d-round-list">
    <ol>
      <li v-for="m in matches" :key="m.key" :class="m.status">
        <span class="d-pair">
          <span :class="{ winner: m.result?.winner === 0 }">{{ sideText(m, 0) }}</span>
          <span class="muted"> – </span>
          <span :class="{ winner: m.result?.winner === 1 }">{{ sideText(m, 1) }}</span>
        </span>
        <strong v-if="m.status === 'finished'" class="d-pair-info">{{ score(m) }}</strong>
        <span v-else-if="m.status === 'called' && m.tableId" class="d-pair-info">{{ t('table.title', { name: tableName?.(m.tableId) ?? '' }) }}</span>
      </li>
    </ol>
    <p v-if="bye" class="muted">{{ t('public.bye', { name: name(bye) }) }}</p>
  </div>
</template>

<style scoped>
.d-round-list ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem 3rem;
  font-size: 2rem;
}
.d-round-list li {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.5rem 0;
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
.d-pair-info {
  flex: none;
}
.d-round-list p {
  margin: 1.5rem 0 0;
  font-size: 1.6rem;
}
</style>
