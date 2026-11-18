<script setup lang="ts">
import { CheckCheck, ListOrdered, Search, Table2, Trophy, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import ForecastPanel from '../../components/live/ForecastPanel.vue';
import PlacementList from '../../components/live/PlacementList.vue';
import PublicMatchList from '../../components/live/PublicMatchList.vue';
import TableCard from '../../components/live/TableCard.vue';
import { useForecast } from '../../composables/useForecast.js';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { useNow } from '../../composables/useNow.js';
import { usePlannedStarts } from '../../composables/usePlannedStarts.js';
import { api, type CompetitionStateInfo } from '../../lib/api.js';
import { competitionText } from '../../lib/competitionText.js';
import type { Translate } from '../../lib/describe.js';
import { competitionProgress, nextOrder, normalizeSearch, recentOrder, sidesMatch } from '../../lib/publicMatches.js';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const live = injectLiveEvent();
const now = useNow();
const forecastDay = ref<string | null>(null);
const { forecast } = useForecast(forecastDay);
const { planned, now: plannedNow } = usePlannedStarts(forecast);
const ops = computed(() => live.operations.value);
const competitions = computed(() => new Map((ops.value?.competitions ?? []).map((c) => [c.id, c])));
const slug = computed(() => route.params.slug as string);

// --- Search: kept in the address, so a player can bookmark "my matches" ---
const query = ref(typeof route.query.q === 'string' ? route.query.q : '');
const search = computed(() => normalizeSearch(query.value));
watch(query, (q) => void router.replace({ query: { ...route.query, q: q.trim() || undefined } }));

const busyTables = computed(() => (ops.value?.tables ?? []).filter((table) => table.match && sidesMatch(table.match.sides, search.value)));
const freeTables = computed(() => (ops.value?.tables ?? []).filter((table) => !table.match));
const next = computed(() => nextOrder(ops.value?.queue ?? [], planned.value).filter((m) => sidesMatch(m.sides, search.value)));
const recent = computed(() => recentOrder(ops.value?.recent ?? []).filter((m) => sidesMatch(m.sides, search.value)));

// --- Placements: where every competition stands, the podium once it is finished ---
const states = ref(new Map<string, CompetitionStateInfo>());
async function loadStates(ids?: Set<string>) {
  const drawn = (live.overview.value?.competitions ?? []).filter((c) => c.drawn && (!ids || ids.has(c.id)));
  const loaded = await Promise.all(drawn.map((c) => api<CompetitionStateInfo>('GET', `/api/competitions/${c.id}/state`).catch(() => null)));
  const nextStates = new Map(ids ? states.value : []);
  drawn.forEach((c, i) => (loaded[i] ? nextStates.set(c.id, loaded[i]) : null));
  states.value = nextStates;
}
void loadStates();
// Only what changed is fetched again: a result reloads its own competition, not all of them
live.onChange((messages) => {
  // No messages: the stream reconnected and anything may have changed
  if (messages.length === 0) return void loadStates();
  const ids = new Set<string>();
  for (const m of messages) {
    if (m.type === 'match') {
      const owner = [...states.value.values()].find((s) => s.matches.some((x) => x.id === m.id));
      if (!owner) return void loadStates();
      ids.add(owner.competition.id);
    } else if (m.type === 'competition' || m.type === 'draw' || m.type === 'pairs') ids.add(m.id);
    else if (m.type === 'event' || m.type === 'persons') return void loadStates();
  }
  if (ids.size > 0) void loadStates(ids);
});
const standings = computed(() =>
  (live.overview.value?.competitions ?? []).map((c) => {
    const state = states.value.get(c.id);
    const text = state ? competitionText(t as Translate, state) : null;
    return {
      competition: c,
      progress: state ? competitionProgress(state) : c.drawn ? null : ({ stage: 'notDrawn' } as const),
      podium: state?.placements.filter((p) => p.place <= 3) ?? [],
      name: (id: string) => text?.name(id) ?? '',
    };
  }),
);
</script>

<template>
  <div v-if="ops" class="stack public-overview">
    <form class="public-search" role="search" @submit.prevent>
      <label class="field">
        <span>{{ t('public.search') }}</span>
        <span class="search-input">
          <Search aria-hidden="true" />
          <input v-model="query" type="search" :placeholder="t('public.searchPlaceholder')" autocomplete="off" enterkeyhint="search" />
          <button v-if="query" type="button" class="search-clear" :aria-label="t('public.clearSearch')" @click="query = ''"><X aria-hidden="true" /></button>
        </span>
      </label>
      <p v-if="search" class="muted small" aria-live="polite">{{ t('public.searchActive', { query: query.trim() }) }}</p>
    </form>

    <section aria-labelledby="public-tables">
      <h2 id="public-tables"><Table2 aria-hidden="true" />{{ t('public.atTables') }}</h2>
      <div v-if="busyTables.length > 0" class="table-grid">
        <TableCard v-for="table in busyTables" :key="table.id" :table="table" :competitions="competitions" :now="now" />
      </div>
      <p v-else class="muted">{{ search ? t('public.noTableMatch') : t('public.allTablesFree') }}</p>
      <p v-if="!search && freeTables.length > 0 && freeTables.length < ops.tables.length" class="muted small free-tables">
        {{ t('public.freeTables', { names: freeTables.map((table) => t('table.title', { name: table.name })).join(', ') }) }}
      </p>
    </section>

    <div class="public-columns">
      <section class="card" aria-labelledby="public-next">
        <div class="card-header">
          <h2 id="public-next"><ListOrdered aria-hidden="true" />{{ t('public.next') }}</h2>
        </div>
        <p v-if="next.length > 0" class="muted small">{{ t('public.nextHint') }}</p>
        <PublicMatchList
          v-if="next.length > 0"
          kind="next"
          :matches="next"
          :competitions="competitions"
          :planned="planned"
          :planned-now="plannedNow"
          :expanded="!!search"
        />
        <p v-else class="muted">{{ t('public.nextEmpty') }}</p>
      </section>

      <section class="card" aria-labelledby="public-recent">
        <h2 id="public-recent"><CheckCheck aria-hidden="true" />{{ t('public.recent') }}</h2>
        <PublicMatchList v-if="recent.length > 0" kind="recent" :matches="recent" :competitions="competitions" :limit="6" :expanded="!!search" />
        <p v-else class="muted">{{ t('public.recentEmpty') }}</p>
      </section>
    </div>

    <section v-if="standings.length > 0" class="card" aria-labelledby="public-placements">
      <h2 id="public-placements"><Trophy aria-hidden="true" />{{ t('public.placements') }}</h2>
      <ul class="competition-standings">
        <li v-for="s in standings" :key="s.competition.id">
          <div class="competition-standing-head">
            <RouterLink :to="`/e/${slug}/c/${s.competition.id}`" class="competition-link">
              <span class="swatch" :style="{ background: `var(--series-${s.competition.color + 1})` }" aria-hidden="true"></span>
              {{ s.competition.name }}
            </RouterLink>
            <span v-if="s.progress?.stage === 'finished'" class="badge">{{ t('public.finished') }}</span>
            <span v-else-if="s.progress?.stage === 'running'" class="muted small">{{ t('public.progressRunning', s.progress) }}</span>
            <span v-else-if="s.progress?.stage === 'notDrawn'" class="muted small">{{ t('public.notDrawnShort') }}</span>
          </div>
          <PlacementList v-if="s.podium.length > 0" :placements="s.podium" :name="s.name" />
          <RouterLink v-if="s.progress?.stage === 'finished'" :to="`/e/${slug}/c/${s.competition.id}`" class="small">{{ t('public.allPlaces') }} →</RouterLink>
        </li>
      </ul>
    </section>

    <ForecastPanel v-model:day="forecastDay" :forecast="forecast" selectable />
  </div>
</template>
