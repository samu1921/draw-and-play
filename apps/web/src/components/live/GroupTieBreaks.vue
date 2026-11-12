<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { groupTieTexts, placementTieTexts } from '../../lib/rules.js';

/** `stage`: a consolation field of three instead of a group */
const props = defineProps<{ state: CompetitionStateInfo; group?: number; stage?: string }>();
const { t } = useI18n();

const info = computed(() =>
  props.stage !== undefined ? props.state.placementGroups?.find((g) => g.stage === props.stage) : props.state.groups.find((g) => g.group === props.group),
);
// A table of rounds rather than a group: a Swiss system, or rotating partners
const isSwiss = computed(() => props.state.competition.format.swiss !== undefined || props.state.competition.format.rotation !== undefined);
const ties = computed(() =>
  props.stage !== undefined ? placementTieTexts(t as Translate, props.state, props.stage) : groupTieTexts(t as Translate, props.state, props.group ?? 0),
);
</script>

<template>
  <!-- Only when there is a tie to explain: without one, the order follows from the wins alone -->
  <details v-if="info?.tieBreaks && ties.length > 0" class="tie-breaks">
    <summary>
      {{ t('rules.tie.show') }}
      <span class="muted">({{ t('rules.tie.count', ties.length, { named: { n: ties.length } }) }})</span>
    </summary>
    <p v-if="!info.complete" class="muted small">{{ t(isSwiss ? 'rules.tie.provisionalSwiss' : 'rules.tie.provisional') }}</p>
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
