<script setup lang="ts">
import { CheckCheck, ListOrdered, Trophy } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import CompetitionRules from '../../components/live/CompetitionRules.vue';
import CompetitionStateView from '../../components/live/CompetitionStateView.vue';
import PlacementList from '../../components/live/PlacementList.vue';
import PublicMatchList, { type ListMatch } from '../../components/live/PublicMatchList.vue';
import { useForecast } from '../../composables/useForecast.js';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { usePlannedStarts } from '../../composables/usePlannedStarts.js';
import { api, type CompetitionStateInfo } from '../../lib/api.js';
import { competitionText } from '../../lib/competitionText.js';
import type { Translate } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';
import { competitionProgress, nextOrder, recentOrder } from '../../lib/publicMatches.js';

const { t, te } = useI18n();
const route = useRoute();
const live = injectLiveEvent();
const competitionId = computed(() => route.params.competitionId as string);
const state = ref<CompetitionStateInfo | null>(null);
const error = ref('');

async function load() {
  try {
    state.value = await api<CompetitionStateInfo>('GET', `/api/competitions/${competitionId.value}/state`);
    error.value = '';
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
watch(competitionId, load, { immediate: true });
live.onChange(load);
const tableName = (id: string) => live.overview.value?.tables.find((t) => t.id === id)?.name;

const { forecast } = useForecast(ref(null));
const { planned, now: plannedNow } = usePlannedStarts(forecast);
const ops = computed(() => live.operations.value);
const competitions = computed(() => new Map((ops.value?.competitions ?? []).map((c) => [c.id, c])));
const text = computed(() => (state.value ? competitionText(t as Translate, state.value) : null));
const progress = computed(() => (state.value ? competitionProgress(state.value) : null));

/** On a table first, then the waiting matches in the expected order */
const next = computed<ListMatch[]>(() => {
  const own = <T extends { competitionId: string }>(m: T | null | undefined): m is T => m?.competitionId === competitionId.value;
  const playing = (ops.value?.tables ?? []).map((table) => table.match).filter(own);
  return [...playing, ...nextOrder((ops.value?.queue ?? []).filter(own), planned.value)];
});
const recent = computed<ListMatch[]>(() => {
  const s = state.value;
  const names = text.value;
  if (!s || !names) return [];
  return recentOrder(s.matches.filter((m) => m.status === 'finished')).map((m) => ({
    ...m,
    id: m.id ?? m.key,
    competitionId: s.competition.id,
    sides: [{ name: names.sideText(m, 0) }, { name: names.sideText(m, 1) }],
  }));
});
</script>

<template>
  <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  <template v-if="state">
    <section class="card" aria-labelledby="competition-title">
      <div class="card-header">
        <h2 id="competition-title">{{ state.competition.name }}</h2>
        <span v-if="progress?.stage === 'finished'" class="badge">{{ t('public.finished') }}</span>
        <span v-else-if="progress?.stage === 'running'" class="muted small">{{ t('public.progressRunning', progress) }}</span>
      </div>
      <template v-if="state.placements.length > 0">
        <h3><Trophy aria-hidden="true" />{{ t('public.placements') }}</h3>
        <p v-if="!state.finished" class="muted small">{{ t('public.placementsSoFar') }}</p>
        <PlacementList :placements="state.placements" :name="(id) => text?.name(id) ?? ''" />
      </template>
      <p v-else-if="state.competition.drawn" class="muted small">{{ t('public.noPlacementsYet') }}</p>
    </section>

    <div v-if="state.competition.drawn && (next.length > 0 || recent.length > 0)" class="public-columns">
      <section class="card" aria-labelledby="competition-next">
        <h2 id="competition-next"><ListOrdered aria-hidden="true" />{{ t('public.next') }}</h2>
        <PublicMatchList
          v-if="next.length > 0"
          kind="next"
          :matches="next"
          :competitions="competitions"
          :planned="planned"
          :planned-now="plannedNow"
          :table-name="tableName"
          hide-competition
        />
        <p v-else class="muted">{{ t('public.nextEmpty') }}</p>
      </section>
      <section class="card" aria-labelledby="competition-recent">
        <h2 id="competition-recent"><CheckCheck aria-hidden="true" />{{ t('public.recent') }}</h2>
        <PublicMatchList v-if="recent.length > 0" kind="recent" :matches="recent" :competitions="competitions" :limit="6" hide-competition />
        <p v-else class="muted">{{ t('public.recentEmpty') }}</p>
      </section>
    </div>

    <section class="card" aria-labelledby="competition-standings">
      <h2 id="competition-standings">{{ t('public.standings') }}</h2>
      <CompetitionStateView :state="state" :table-name="tableName" hide-placements />
    </section>
    <section class="card">
      <h2>{{ t('rules.title') }}</h2>
      <CompetitionRules :state="state" />
    </section>
  </template>
</template>
