<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { elapsed } from '../../composables/useNow.js';
import type { Operations } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';

const props = defineProps<{
  table: Operations['tables'][number];
  competitions: Map<string, Operations['competitions'][number]>;
  now: number;
  large?: boolean;
}>();
const { t } = useI18n();
const competitionOf = () => (props.table.match ? props.competitions.get(props.table.match.competitionId) : undefined);
</script>

<template>
  <article class="table-card" :class="{ busy: table.match, large }">
    <header class="table-card-head">
      <h3>{{ t('table.title', { name: table.name }) }}</h3>
      <span v-if="table.match" class="timer">{{ elapsed(table.match.calledAt, now) }}</span>
      <span v-else class="muted">{{ t('admin.desk.free') }}</span>
    </header>
    <template v-if="table.match">
      <p class="table-card-meta">
        <span class="swatch" :style="{ background: `var(--series-${(competitionOf()?.color ?? 0) + 1})` }" aria-hidden="true"></span>
        {{ competitionOf()?.name }} · {{ matchLabel(t, table.match) }}
      </p>
      <p class="table-card-players">
        <span>{{ table.match.sides[0]?.name }}</span>
        <span class="vs">{{ t('public.vs') }}</span>
        <span>{{ table.match.sides[1]?.name }}</span>
      </p>
    </template>
    <div v-if="$slots.default" class="table-card-actions"><slot /></div>
  </article>
</template>
