<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import type { CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { competitionRules } from '../../lib/rules.js';

const props = defineProps<{ state: CompetitionStateInfo }>();
const { t, te } = useI18n();
const live = injectLiveEvent();

const sections = computed(() => {
  const { competition, groups, entries } = props.state;
  // After the draw the structure is fixed by the groups; before it, by the current entries.
  const drawnCount = groups.reduce((n, g) => n + g.entries.length, 0);
  return competitionRules(t as Translate, {
    format: competition.format,
    matchRules: competition.matchRules,
    ranking: live.sport.value.ranking,
    ...(te(`rules.reference.${live.sport.value.id}`) && { reference: t(`rules.reference.${live.sport.value.id}`) }),
    entryCount: drawnCount > 0 ? drawnCount : entries.length,
    drawn: competition.drawn,
  });
});
</script>

<template>
  <div class="competition-rules">
    <section v-for="s in sections" :key="s.title" class="rules-section">
      <h3>{{ s.title }}</h3>
      <p v-for="(p, i) in s.paragraphs" :key="i">{{ p }}</p>
      <ol v-if="s.ordered">
        <li v-for="(item, i) in s.ordered" :key="i">{{ item }}</li>
      </ol>
      <ul v-if="s.items" class="rules-items">
        <li v-for="(item, i) in s.items" :key="i">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.competition-rules {
  display: grid;
  gap: 1rem;
}
.rules-section h3 {
  margin: 0 0 0.35rem;
}
.rules-section p {
  margin: 0 0 0.35rem;
}
.rules-section ol,
.rules-section ul {
  margin: 0.25rem 0 0;
  padding-left: 1.4rem;
}
.rules-section li + li {
  margin-top: 0.25rem;
}
.rules-items {
  font-variant-numeric: tabular-nums;
}
</style>
