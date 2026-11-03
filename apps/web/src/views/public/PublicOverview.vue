<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TableCard from '../../components/live/TableCard.vue';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { useNow } from '../../composables/useNow.js';
import { matchLabel } from '../../lib/describe.js';

const { t } = useI18n();
const live = injectLiveEvent();
const now = useNow();
const ops = computed(() => live.operations.value);
const competitions = computed(() => new Map((ops.value?.competitions ?? []).map((c) => [c.id, c])));
</script>

<template>
  <div v-if="ops" class="stack">
    <section aria-labelledby="public-tables">
      <h2 id="public-tables" class="visually-hidden">{{ t('public.tables') }}</h2>
      <div class="table-grid">
        <TableCard v-for="table in ops.tables" :key="table.id" :table="table" :competitions="competitions" :now="now" />
      </div>
    </section>
    <section v-if="ops.recent.length > 0" class="card" aria-labelledby="public-recent">
      <h2 id="public-recent">{{ t('public.recent') }}</h2>
      <ul class="queue">
        <li v-for="m in ops.recent" :key="m.id" class="queue-item">
          <div class="queue-text">
            <span class="queue-meta">{{ competitions.get(m.competitionId)?.name }} · {{ matchLabel(t, m) }}</span>
            <span class="queue-players">
              <strong v-if="m.result?.winner === 0">{{ m.sides[0]?.name }}</strong><template v-else>{{ m.sides[0]?.name }}</template>
              –
              <strong v-if="m.result?.winner === 1">{{ m.sides[1]?.name }}</strong><template v-else>{{ m.sides[1]?.name }}</template>
              <span class="muted">
                {{ m.result?.walkover ? t('public.walkover') : m.result?.games.map(([a, b]) => `${a}:${b}`).join(', ') }}
              </span>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
