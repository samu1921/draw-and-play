<script setup lang="ts">
import {
  bracketSize,
  generateVariants,
  rankForSeeding,
  validateFormat,
  type PairDrawMode,
  type PlacementMode,
  type SeedPlacement,
} from '@draw-and-play/domain';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import CompetitionStateView from '../../components/live/CompetitionStateView.vue';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type CompetitionStateInfo, type EntryInfo, type PersonInfo } from '../../lib/api.js';
import { describeFormat, describePlacements, sameFormat } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();
const live = injectLiveEvent();
const eventId = computed(() => live.overview.value!.event.id);
const competitionId = computed(() => route.params.competitionId as string);

const state = ref<CompetitionStateInfo | null>(null);
const persons = ref<PersonInfo[]>([]);
const error = ref('');

async function load() {
  const [s, p] = await Promise.all([
    api<CompetitionStateInfo>('GET', `/api/competitions/${competitionId.value}/state`),
    api<{ persons: PersonInfo[] }>('GET', `/api/events/${eventId.value}/persons`),
  ]);
  state.value = s;
  persons.value = p.persons;
}
watch(competitionId, () => void load().catch((e) => (error.value = errorText(t, te, e))), { immediate: true });
live.onChange(() => void load());

async function run(action: () => Promise<unknown>) {
  error.value = '';
  try {
    await action();
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    await load();
  }
}

const competition = computed(() => state.value?.competition);
const activeEntries = computed(() => state.value?.entries.filter((e) => e.status !== 'withdrawn') ?? []);
const isDoubles = computed(() => competition.value?.kind === 'doubles');
/** Doubles players still waiting for a partner from the pair draw */
const unpaired = computed(() => (isDoubles.value ? activeEntries.value.filter((e) => e.members.length === 1) : []));
/** Entries the draw will have: two unpaired players make one pair */
const drawCount = computed(() => activeEntries.value.length - unpaired.value.length + Math.ceil(unpaired.value.length / 2));
const entered = computed(() => new Set(state.value?.entries.flatMap((e) => e.members.map((m) => m.id)) ?? []));
const available = computed(() => persons.value.filter((p) => !entered.value.has(p.id)));
const entryName = (e: EntryInfo) => e.members.map((m) => m.name).join(' / ');
const tableName = (id: string) => live.overview.value?.tables.find((t) => t.id === id)?.name;

// --- Entries ---
const selected = ref<string[]>([]);
const pair = ref<[string, string]>(['', '']);
const addSelected = () =>
  run(async () => {
    for (const personId of selected.value) {
      await api('POST', `/api/competitions/${competitionId.value}/entries`, { personIds: [personId], status: 'present' });
    }
    selected.value = [];
  });
const addPair = () =>
  run(async () => {
    await api('POST', `/api/competitions/${competitionId.value}/entries`, { personIds: pair.value, status: 'present' });
    pair.value = ['', ''];
  });
const splitPairs = (entryIds?: string[]) => run(() => api('POST', `/api/competitions/${competitionId.value}/pairs/split`, entryIds ? { entryIds } : {}));
const splitAll = () => {
  if (confirm(t('admin.competition.splitAllConfirm'))) void splitPairs();
};
const updateEntry = (e: EntryInfo, patch: Record<string, unknown>) => run(() => api('PATCH', `/api/entries/${e.id}`, patch));
const removeEntry = (e: EntryInfo) => run(() => api('DELETE', `/api/entries/${e.id}`));

// --- Format ---
const placements = ref<PlacementMode>('none');
const variantId = ref('');
const variants = computed(() => generateVariants(drawCount.value, { placements: placements.value }));
watch(
  competition,
  (c) => {
    if (c) placements.value = c.format.knockout?.placements ?? 'none';
  },
  { immediate: true },
);
watch(
  [variants, competition],
  () => {
    const current = competition.value?.format;
    variantId.value = variants.value.find((v) => current && sameFormat(v.format, current))?.id ?? variants.value[0]?.id ?? '';
  },
  { immediate: true },
);
const formatError = computed(() => (competition.value ? validateFormat(competition.value.format, drawCount.value) : null));
const saveFormat = () =>
  run(async () => {
    const variant = variants.value.find((v) => v.id === variantId.value);
    if (variant) await api('PATCH', `/api/competitions/${competitionId.value}`, { format: variant.format, version: competition.value!.version });
  });

// --- Seeding list ---
/** Seeding input as the server builds it: manual seed, then the (average) rating */
const seedingOf = (e: EntryInfo) => {
  const ratings = e.members.flatMap((m) => (m.rating == null ? [] : [m.rating]));
  return {
    id: e.id,
    seed: e.seed ?? undefined,
    rating: ratings.length === e.members.length && ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined,
  };
};
const groupDraw = computed(() => competition.value?.format.groups !== undefined);
const defaultSeedCount = computed(() =>
  groupDraw.value ? competition.value!.format.groups!.groupCount : Math.max(2, bracketSize(drawCount.value) / 4),
);
const seedCount = ref<number | null>(null);
const seedPlacement = ref<SeedPlacement>('fixed');
const effectiveSeedCount = computed(() => Math.min(seedCount.value ?? defaultSeedCount.value, drawCount.value));
watch(
  () => [competitionId.value, groupDraw.value],
  () => {
    seedCount.value = null;
    seedPlacement.value = groupDraw.value ? 'fixed' : 'drawn';
  },
  { immediate: true },
);
/** While players wait for a partner the list is the pair draw's (upper half seeded), otherwise the competition draw's */
const seeding = computed(() => {
  const pairing = unpaired.value.length > 0;
  const list = pairing ? unpaired.value : activeEntries.value;
  const seeded = pairing ? Math.floor(list.length / 2) : effectiveSeedCount.value;
  const rank = new Map(rankForSeeding(list.map(seedingOf)).map((e, i) => [e.id, i + 1]));
  return { rank, seeded };
});
const sortedEntries = computed(() =>
  [...(state.value?.entries ?? [])].sort(
    (a, b) => (seeding.value.rank.get(a.id) ?? Number.POSITIVE_INFINITY) - (seeding.value.rank.get(b.id) ?? Number.POSITIVE_INFINITY),
  ),
);

// --- Doubles pairs ---
const pairMode = ref<PairDrawMode>('seeded');
const pairSeed = ref('');
const drawPairs = () =>
  run(() =>
    api('POST', `/api/competitions/${competitionId.value}/pairs/draw`, { mode: pairMode.value, ...(pairSeed.value && { seed: pairSeed.value }) }),
  );

// --- Draw ---
const seed = ref('');
const draw = () =>
  run(() =>
    api('POST', `/api/competitions/${competitionId.value}/draw`, {
      ...(seed.value && { seed: seed.value }),
      seedCount: effectiveSeedCount.value,
      seedPlacement: seedPlacement.value,
    }),
  );
const undoDraw = () => {
  if (confirm(t('admin.competition.undoConfirm'))) void run(() => api('DELETE', `/api/competitions/${competitionId.value}/draw`));
};
const removeCompetition = async () => {
  if (!competition.value || !confirm(t('admin.competition.deleteConfirm', { name: competition.value.name }))) return;
  await run(async () => {
    await api('DELETE', `/api/competitions/${competitionId.value}`);
    await live.reload();
    await router.push(`/admin/events/${eventId.value}/competitions`);
  });
};
</script>

<template>
  <div v-if="state && competition" class="stack">
    <header class="page-title">
      <h2>
        <span class="swatch" :style="{ background: `var(--series-${competition.color + 1})` }" aria-hidden="true"></span>
        {{ competition.name }}
        <span class="muted">· {{ t(`admin.competitions.kinds.${competition.kind}`) }}</span>
      </h2>
      <button v-if="!competition.drawn" type="button" class="button secondary small" @click="removeCompetition">{{ t('common.delete') }}</button>
    </header>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>

    <template v-if="!competition.drawn">
      <section class="card" aria-labelledby="entries-title">
        <h3 id="entries-title">{{ t('admin.competition.entries') }} ({{ activeEntries.length }})</h3>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col" class="num">{{ t('admin.competition.seedingRank') }}</th>
                <th scope="col">{{ t('public.entry') }}</th>
                <th scope="col">{{ t('admin.persons.club') }}</th>
                <th scope="col" class="num">{{ t('admin.persons.rating') }}</th>
                <th scope="col">{{ t('admin.competition.seed') }}</th>
                <th scope="col">{{ t('admin.competition.status') }}</th>
                <th scope="col"><span class="visually-hidden">{{ t('admin.competition.remove') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in sortedEntries" :key="e.id">
                <td class="num">{{ seeding.rank.get(e.id) ?? '–' }}</td>
                <th scope="row">
                  {{ entryName(e) }}
                  <span v-if="(seeding.rank.get(e.id) ?? Infinity) <= seeding.seeded" class="badge">{{ t('admin.competition.seeded') }}</span>
                  <span v-if="isDoubles && e.members.length === 1" class="muted small">· {{ t('admin.competition.noPartner') }}</span>
                </th>
                <td>{{ [...new Set(e.members.map((m) => m.club).filter(Boolean))].join(' / ') }}</td>
                <td class="num">{{ e.members.map((m) => m.rating ?? '–').join(' / ') }}</td>
                <td>
                  <input
                    class="seed-input"
                    type="number"
                    min="1"
                    max="256"
                    :value="e.seed ?? ''"
                    :aria-label="`${t('admin.competition.seed')}: ${entryName(e)}`"
                    @change="updateEntry(e, { seed: ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null })"
                  />
                </td>
                <td>
                  <select
                    :value="e.status"
                    :aria-label="`${t('admin.competition.status')}: ${entryName(e)}`"
                    @change="updateEntry(e, { status: ($event.target as HTMLSelectElement).value })"
                  >
                    <option v-for="s in ['registered', 'present', 'withdrawn'] as const" :key="s" :value="s">{{ t(`admin.competition.statuses.${s}`) }}</option>
                  </select>
                </td>
                <td>
                  <div class="row-actions">
                    <button
                      v-if="isDoubles && e.members.length === 2"
                      type="button"
                      class="button secondary small"
                      :aria-label="`${t('admin.competition.splitPair')}: ${entryName(e)}`"
                      @click="splitPairs([e.id])"
                    >
                      {{ t('admin.competition.splitPair') }}
                    </button>
                    <button type="button" class="button icon" :aria-label="`${t('admin.competition.remove')}: ${entryName(e)}`" @click="removeEntry(e)">×</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="muted small">{{ t('admin.competition.seedingHint', { rating: live.sport.value.ratingName }) }}</p>
        <div class="stack">
          <h4 v-if="isDoubles">{{ t('admin.competition.addPlayers') }}</h4>
          <p v-if="isDoubles" class="muted small">{{ t('admin.competition.addPlayersHint') }}</p>
          <p v-if="available.length === 0" class="muted">{{ t('admin.competition.everyoneEntered') }}</p>
          <div v-else class="check-grid">
            <label v-for="p in available" :key="p.id" class="check">
              <input v-model="selected" type="checkbox" :value="p.id" />
              {{ p.name }} <span class="muted">{{ p.club }}</span>
            </label>
          </div>
          <div><button type="button" class="button" :disabled="selected.length === 0" @click="addSelected">{{ t('admin.competition.addSelected') }}</button></div>
        </div>
        <h4 v-if="isDoubles">{{ t('admin.competition.addFixedPair') }}</h4>
        <div v-if="isDoubles" class="fields">
          <label v-for="i in [0, 1] as const" :key="i" class="field">
            <span>{{ t(i === 0 ? 'admin.competition.player1' : 'admin.competition.player2') }}</span>
            <select v-model="pair[i]">
              <option value="">—</option>
              <option v-for="p in available" :key="p.id" :value="p.id" :disabled="pair[1 - i] === p.id">{{ p.name }}</option>
            </select>
          </label>
          <div class="field form-actions">
            <button type="button" class="button" :disabled="!pair[0] || !pair[1]" @click="addPair">{{ t('admin.competition.addPair') }}</button>
          </div>
        </div>
      </section>

      <section v-if="isDoubles" class="card" aria-labelledby="pairs-title">
        <h3 id="pairs-title">{{ t('admin.competition.pairDraw') }}</h3>
        <p v-if="unpaired.length === 0" class="muted">{{ t('admin.competition.noUnpaired') }}</p>
        <template v-else>
          <p>{{ t('admin.competition.unpairedCount', { n: unpaired.length }) }}</p>
          <p v-if="unpaired.length % 2 !== 0" class="warning-text">{{ t('admin.competition.oddUnpaired') }}</p>
          <div class="fields">
            <label class="field wide">
              <span>{{ t('admin.competition.pairMode') }}</span>
              <select v-model="pairMode">
                <option v-for="mode in ['seeded', 'random'] as const" :key="mode" :value="mode">{{ t(`admin.competition.pairModes.${mode}`) }}</option>
              </select>
            </label>
            <label class="field">
              <span>{{ t('admin.competition.drawSeed') }}</span>
              <input v-model="pairSeed" type="text" maxlength="64" />
            </label>
            <div class="field form-actions">
              <button type="button" class="button" :disabled="unpaired.length < 2 || unpaired.length % 2 !== 0" @click="drawPairs">
                {{ t('admin.competition.drawPairs') }}
              </button>
            </div>
          </div>
          <p class="muted small">{{ t(`admin.competition.pairModeHints.${pairMode}`) }}</p>
        </template>
        <div v-if="activeEntries.some((e) => e.members.length === 2)">
          <button type="button" class="button secondary small" @click="splitAll">{{ t('admin.competition.splitAll') }}</button>
        </div>
      </section>

      <section class="card" aria-labelledby="format-title">
        <h3 id="format-title">{{ t('admin.competition.format') }}</h3>
        <p>{{ describeFormat(t, competition.format, drawCount) }}</p>
        <p v-if="formatError" class="warning-text">{{ t('admin.competition.formatInvalid', { n: drawCount }) }}</p>
        <div v-if="variants.length > 0" class="fields">
          <label class="field wide">
            <span>{{ t('admin.competition.format') }}</span>
            <select v-model="variantId">
              <option v-for="v in variants" :key="v.id" :value="v.id">{{ describeFormat(t, v.format, drawCount) }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('planner.competitions.placements') }}</span>
            <select v-model="placements">
              <option v-for="mode in ['none', 'thirdPlace', 'all'] as const" :key="mode" :value="mode">{{ describePlacements(t, mode) }}</option>
            </select>
          </label>
          <div class="field form-actions">
            <button type="button" class="button secondary" @click="saveFormat">{{ t('admin.competition.saveFormat') }}</button>
          </div>
        </div>
      </section>

      <section class="card" aria-labelledby="draw-title">
        <h3 id="draw-title">{{ t('admin.competition.draw') }}</h3>
        <p v-if="unpaired.length > 0" class="warning-text">{{ t('admin.competition.drawNeedsPairs') }}</p>
        <div class="fields">
          <label class="field">
            <span>{{ t('admin.competition.seedCount') }}</span>
            <input
              class="seed-input"
              type="number"
              min="0"
              :max="drawCount"
              :value="effectiveSeedCount"
              @change="seedCount = Math.max(0, Number(($event.target as HTMLInputElement).value) || 0)"
            />
          </label>
          <div class="field form-actions">
            <button type="button" class="button secondary small" @click="seedCount = Math.floor(drawCount / 2)">{{ t('admin.competition.seedHalf') }}</button>
          </div>
          <label class="field wide">
            <span>{{ t('admin.competition.seedPlacement') }}</span>
            <select v-model="seedPlacement">
              <option v-for="p in ['fixed', 'drawn'] as const" :key="p" :value="p">
                {{ t(`admin.competition.seedPlacements.${groupDraw ? 'groups' : 'knockout'}.${p}`) }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('admin.competition.drawSeed') }}</span>
            <input v-model="seed" type="text" maxlength="64" />
          </label>
          <div class="field form-actions">
            <button type="button" class="button" :disabled="formatError !== null || unpaired.length > 0" @click="draw">{{ t('admin.competition.draw') }}</button>
          </div>
        </div>
        <p class="muted small">
          {{ t(groupDraw ? 'admin.competition.unseededHintGroups' : 'admin.competition.unseededHintKnockout') }}
          {{ t('admin.competition.drawSeedHint') }}
        </p>
      </section>
    </template>

    <template v-else>
      <div class="button-row">
        <span class="muted">{{ t('admin.competition.drawnWithSeed', { seed: state.drawSeed }) }}</span>
        <button type="button" class="button secondary small" @click="undoDraw">{{ t('admin.competition.undoDraw') }}</button>
      </div>
      <section class="card">
        <CompetitionStateView :state="state" :table-name="tableName" />
      </section>
    </template>
  </div>
  <p v-else class="muted">{{ t('common.loading') }}</p>
</template>
