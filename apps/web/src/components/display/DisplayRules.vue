<script setup lang="ts">
import type { RankingCriterion } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { competitionRules } from '../../lib/rules.js';

const props = defineProps<{ state: CompetitionStateInfo; ranking: readonly RankingCriterion[] }>();
const { t } = useI18n();

const sections = computed(() => {
  const { competition, groups, entries } = props.state;
  const drawnCount = groups.reduce((n, g) => n + g.entries.length, 0);
  return competitionRules(t as Translate, {
    format: competition.format,
    matchRules: competition.matchRules,
    ranking: props.ranking,
    entryCount: drawnCount > 0 ? drawnCount : entries.length,
    drawn: competition.drawn,
    compact: true,
  });
});
</script>

<template>
  <div class="d-rules">
    <section v-for="s in sections" :key="s.title" class="d-rules-section">
      <h3>{{ s.title }}</h3>
      <p v-for="(p, i) in s.paragraphs" :key="i">{{ p }}</p>
      <ol v-if="s.ordered">
        <li v-for="(item, i) in s.ordered" :key="i">{{ item }}</li>
      </ol>
      <ul v-if="s.items" class="d-rules-items" :class="{ grid: s.items.length > 4 && s.items.every((item) => item.length <= 16) }">
        <li v-for="(item, i) in s.items" :key="i">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>
