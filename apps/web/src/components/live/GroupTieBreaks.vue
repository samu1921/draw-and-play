<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import type { CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { tieBreakText } from '../../lib/rules.js';

const props = defineProps<{ state: CompetitionStateInfo; group: number }>();
const { t } = useI18n();
const { name, score } = useCompetitionText(() => props.state);

const info = computed(() => props.state.groups.find((g) => g.group === props.group));
const played = computed(() => props.state.matches.some((m) => m.phase === 'group' && m.group === props.group && m.status === 'finished'));

const ties = computed(() => {
  const g = info.value;
  if (!g?.tieBreaks) return [];
  const rank = new Map(g.standings.map((r) => [r.entryId, r.rank]));
  const duels = (ids: string[]) => {
    const members = new Set(ids);
    return props.state.matches
      .filter((m) => m.phase === 'group' && m.group === props.group && m.status === 'finished')
      .filter((m) => m.sides.every((s) => s !== null && members.has(s)))
      .map((m) => `${name(m.sides[0])} – ${name(m.sides[1])} ${score(m)}`);
  };
  return g.tieBreaks.map((tie) =>
    tieBreakText(t as Translate, tie, { name: (id) => name(id), rankOf: (id) => rank.get(id) ?? 0, duels }),
  );
});
</script>

<template>
  <details v-if="info?.tieBreaks && played" class="tie-breaks">
    <summary>
      {{ t('rules.tie.show') }}
      <span class="muted">({{ t('rules.tie.count', ties.length, { named: { n: ties.length } }) }})</span>
    </summary>
    <p v-if="!info.complete" class="muted small">{{ t('rules.tie.provisional') }}</p>
    <p v-if="ties.length === 0">{{ t('rules.tie.none') }}</p>
    <section v-for="(tie, i) in ties" :key="i" class="tie">
      <h4>{{ tie.title }}</h4>
      <p class="muted">{{ tie.level }}</p>
      <ol>
        <li v-for="(step, j) in tie.steps" :key="j">{{ step }}</li>
      </ol>
    </section>
    <p class="muted small">{{ t('rules.tie.rules') }}</p>
  </details>
</template>

<style scoped>
.tie-breaks {
  margin-top: 0.5rem;
}
.tie-breaks summary {
  cursor: pointer;
  font-weight: 600;
}
.tie {
  margin-top: 0.75rem;
}
.tie h4 {
  margin: 0;
}
.tie p {
  margin: 0.15rem 0;
}
.tie ol {
  margin: 0.25rem 0 0;
  padding-left: 1.4rem;
}
.tie li + li {
  margin-top: 0.25rem;
}
</style>
