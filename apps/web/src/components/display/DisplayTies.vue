<script setup lang="ts">
import { groupLetter } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { groupTieTexts } from '../../lib/rules.js';

const props = defineProps<{ state: CompetitionStateInfo; ties: { group: number; index: number }[] }>();
const { t } = useI18n();

const blocks = computed(() => {
  const byGroup = new Map<number, ReturnType<typeof groupTieTexts>>();
  return props.ties.flatMap(({ group, index }) => {
    if (!byGroup.has(group)) byGroup.set(group, groupTieTexts(t as Translate, props.state, group));
    const text = byGroup.get(group)![index];
    if (!text) return [];
    // A competition with a single group needs no group letter
    const title = props.state.groups.length > 1 ? t('rules.tie.groupTitle', { group: groupLetter(group), title: text.title }) : text.title;
    return [{ key: `${group}:${index}`, title, level: text.level, steps: text.steps }];
  });
});
</script>

<template>
  <div class="d-ties" :class="{ single: blocks.length === 1 }">
    <section v-for="b in blocks" :key="b.key" class="d-tie">
      <h3>{{ b.title }}</h3>
      <p class="d-tie-level">{{ b.level }}</p>
      <ol>
        <li v-for="(step, i) in b.steps" :key="i">{{ step }}</li>
      </ol>
    </section>
  </div>
</template>
