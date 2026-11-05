<script setup lang="ts">
import { assetUrl, branding, DEFAULT_DISPLAY_DIM, useEventBranding } from '../../lib/branding.js';
import { useEventTitle } from '../../lib/pageTitle.js';
import { groupLetter } from '@draw-and-play/domain';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import DisplayBracket from '../../components/display/DisplayBracket.vue';
import DisplayEntries from '../../components/display/DisplayEntries.vue';
import DisplayGroups from '../../components/display/DisplayGroups.vue';
import DisplayStage from '../../components/display/DisplayStage.vue';
import FitBox from '../../components/display/FitBox.vue';
import StreamBadge from '../../components/live/StreamBadge.vue';
import ViewerGate from '../../components/live/ViewerGate.vue';
import TableCard from '../../components/live/TableCard.vue';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { useNow } from '../../composables/useNow.js';
import { api, defaultDisplaySettings, type CompetitionStateInfo, type DisplayProfile } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { buildSlides, competitionShown, groupRevealOrder, mainBracketRounds, NEXT_MATCHES, type Slide } from '../../lib/displaySlides.js';
import { formatClock } from '../../lib/time.js';

const { t } = useI18n();
const route = useRoute();
const slug = computed(() => route.params.slug as string);
const profileId = computed(() => (route.params.profileId as string | undefined) || null);
const live = useLiveEvent(slug, { operations: true, remember: true });
useEventTitle(computed(() => live.overview.value?.event.name ?? live.locked.value?.name));
useEventBranding(computed(() => live.overview.value?.event.settings.branding));
const now = useNow();

// The projector always uses the dark theme: better contrast on weak projectors.
let previousTheme: string | undefined;
onMounted(() => {
  previousTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'dark';
});
onBeforeUnmount(() => {
  if (previousTheme === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = previousTheme;
});

// --- Profile ---
const profile = ref<DisplayProfile | null>(null);
const profileMissing = ref(false);
async function loadProfile() {
  profileMissing.value = false;
  if (!profileId.value) return (profile.value = null);
  try {
    profile.value = (await api<{ display: DisplayProfile }>('GET', `/api/displays/${profileId.value}`)).display;
  } catch {
    profile.value = null;
    profileMissing.value = true;
  }
}
watch(profileId, loadProfile, { immediate: true });
// The profile is refused too while the viewer code is missing
watch(
  () => live.locked.value,
  (locked, before) => {
    if (before && !locked) void loadProfile();
  },
);
const settings = computed(() => profile.value?.settings ?? defaultDisplaySettings);

// --- Data ---
const today = computed(() => {
  const d = new Date(now.value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
const competitions = computed(() => live.overview.value?.competitions ?? []);
const states = ref(new Map<string, CompetitionStateInfo>());
let loadSeq = 0;
async function loadStates() {
  const seq = ++loadSeq;
  const list = competitions.value.filter((c) => competitionShown(c, settings.value, today.value) && (c.drawn || settings.value.entries));
  const loaded = await Promise.all(list.map((c) => api<CompetitionStateInfo>('GET', `/api/competitions/${c.id}/state`))).catch(() => null);
  if (loaded && seq === loadSeq) states.value = new Map(list.map((c, i) => [c.id, loaded[i]!]));
}
// The overview is refetched after every change, so this also follows results and draws.
watch([() => live.overview.value, settings, today], () => void loadStates());

live.onChange((messages) => {
  if (messages.some((m) => m.type === 'display' && m.id === profileId.value)) void loadProfile();
  const draw = messages.findLast((m) => m.type === 'draw' || m.type === 'pairs');
  if (draw && settings.value.liveDraw) void startReveal(draw.id, draw.type as 'draw' | 'pairs');
});

const slides = computed(() =>
  buildSlides({
    settings: settings.value,
    today: today.value,
    competitions: competitions.value,
    states: states.value,
    tableIds: live.operations.value?.tables.map((t) => t.id) ?? [],
  }),
);

// --- Rotation ---
/** Kept by key, so the rotation stays on its slide while data (and so the slide list) changes */
const position = ref({ key: '', index: 0 });
const currentIndex = computed(() => {
  const i = slides.value.findIndex((s) => s.key === position.value.key);
  return i >= 0 ? i : Math.min(position.value.index, Math.max(0, slides.value.length - 1));
});
const current = computed<Slide | null>(() => slides.value[currentIndex.value] ?? null);
const paused = ref(false);
/** Bumped to restart the slide timer and its progress bar */
const cycle = ref(0);

function go(delta: number) {
  const n = slides.value.length;
  if (n === 0) return;
  const i = (((currentIndex.value + delta) % n) + n) % n;
  position.value = { key: slides.value[i]!.key, index: i };
  cycle.value++;
}


// --- Live draw ---
const REVEAL_STEP_MS = { groups: 1500, bracket: 1500, pairs: 1100 };
const REVEAL_HOLD_MS = 30_000;
interface Reveal {
  competitionId: string;
  mode: 'groups' | 'bracket' | 'pairs';
  state: CompetitionStateInfo;
  /** groups: entries in reveal order; pairs: pair entries */
  order: string[];
  total: number;
  step: number;
}
const reveal = ref<Reveal | null>(null);
let revealTimer: ReturnType<typeof setTimeout> | undefined;

async function startReveal(competitionId: string, type: 'draw' | 'pairs') {
  const competition = competitions.value.find((c) => c.id === competitionId);
  if (!competition || !competitionShown(competition, settings.value, today.value)) return;
  const state = await api<CompetitionStateInfo>('GET', `/api/competitions/${competitionId}/state`).catch(() => null);
  if (!state) return;
  let next: Reveal;
  if (type === 'pairs') {
    const order = state.entries.filter((e) => e.status !== 'withdrawn' && e.members.length === 2).map((e) => e.id);
    next = { competitionId, mode: 'pairs', state, order, total: order.length * 2, step: 0 };
  } else if (state.groups.length > 0) {
    const order = groupRevealOrder(state);
    next = { competitionId, mode: 'groups', state, order, total: order.length, step: 0 };
  } else {
    const firstRound = mainBracketRounds(state.matches)[0]?.length ?? 0;
    next = { competitionId, mode: 'bracket', state, order: [], total: firstRound, step: 0 };
  }
  if (next.total === 0) return;
  reveal.value = next;
  revealPaused.value = false;
  tick();
}

const revealPaused = ref(false);
function tick() {
  clearTimeout(revealTimer);
  const r = reveal.value;
  if (!r || revealPaused.value) return;
  if (r.step < r.total) {
    revealTimer = setTimeout(() => {
      r.step++;
      tick();
    }, REVEAL_STEP_MS[r.mode]);
  } else {
    revealTimer = setTimeout(endReveal, REVEAL_HOLD_MS);
  }
}

/** Back to the rotation, starting with the competition that was just drawn */
function endReveal() {
  clearTimeout(revealTimer);
  const r = reveal.value;
  reveal.value = null;
  if (!r) return;
  const i = slides.value.findIndex((s) => 'competitionId' in s && s.competitionId === r.competitionId);
  if (i >= 0) position.value = { key: slides.value[i]!.key, index: i };
  cycle.value++;
}
onBeforeUnmount(() => clearTimeout(revealTimer));

// Next slide after the profile's time; not while paused or while a draw is being revealed.
let slideTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  [() => current.value?.key, cycle, paused, () => settings.value.slideSeconds, () => reveal.value === null],
  () => {
    clearTimeout(slideTimer);
    if (paused.value || reveal.value || slides.value.length <= 1) return;
    slideTimer = setTimeout(() => go(1), settings.value.slideSeconds * 1000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(slideTimer));

const revealGroups = computed(() => {
  const r = reveal.value;
  if (r?.mode !== 'groups') return null;
  return {
    groups: r.state.groups.map((g) => g.group),
    columns: Math.min(4, r.state.groups.length),
    revealed: new Set(r.order.slice(0, r.step)),
    latest: r.order[r.step - 1] ?? null,
  };
});

// --- Controls: keyboard, presenter clicker (PageUp/PageDown), mouse ---
function next() {
  const r = reveal.value;
  if (!r) return go(1);
  if (r.step < r.total) {
    r.step = r.total;
    tick();
  } else endReveal();
}
function previous() {
  if (reveal.value) endReveal();
  else go(-1);
}
function togglePause() {
  if (reveal.value) {
    revealPaused.value = !revealPaused.value;
    tick();
    return;
  }
  paused.value = !paused.value;
  cycle.value++;
}
const isFullscreen = ref(false);
const syncFullscreen = () => (isFullscreen.value = document.fullscreenElement !== null);
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

function onKey(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const actions: Record<string, () => void> = {
    ArrowRight: next,
    PageDown: next,
    ArrowLeft: previous,
    PageUp: previous,
    ' ': togglePause,
    k: togglePause,
    f: toggleFullscreen,
  };
  const action = actions[e.key];
  if (!action) return;
  e.preventDefault();
  action();
  showControls();
}

const controlsVisible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | undefined;
function showControls() {
  controlsVisible.value = true;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => (controlsVisible.value = false), 3000);
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', syncFullscreen);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('fullscreenchange', syncFullscreen);
  clearTimeout(hideTimer);
});

// --- Slide content ---
const stateOf = (id: string) => states.value.get(id);
const competitionOf = (id: string) => competitions.value.find((c) => c.id === id);
const operationsCompetitions = computed(() => new Map((live.operations.value?.competitions ?? []).map((c) => [c.id, c])));
const tablesById = computed(() => new Map((live.operations.value?.tables ?? []).map((table) => [table.id, table])));
const nextMatches = computed(() => (live.operations.value?.queue ?? []).filter((m) => !m.busy).slice(0, NEXT_MATCHES));
const tableName = (id: string) => live.overview.value?.tables.find((table) => table.id === id)?.name;
const clock = computed(() => formatClock(new Date(now.value).getHours() * 60 + new Date(now.value).getMinutes()));
const pageSuffix = (s: Slide) => (s.pages > 1 ? ` (${s.page + 1}/${s.pages})` : '');

const heading = computed(() => {
  const r = reveal.value;
  if (r) return { competitionId: r.competitionId, sub: t(r.mode === 'pairs' ? 'display.revealPairs' : 'display.revealDraw') };
  const s = current.value;
  if (!s) return null;
  switch (s.kind) {
    case 'tables':
      return { sub: t('display.tables') + pageSuffix(s) };
    case 'next':
      return { sub: t('display.next') };
    case 'groups': {
      const state = stateOf(s.competitionId);
      const letters = s.groups.map((g) => groupLetter(g));
      const range = s.pages > 1 ? t('display.groupsRange', { from: letters[0], to: letters.at(-1) }) : (state?.groups.length ?? 0) > 1 ? t('display.groups') : '';
      return { competitionId: s.competitionId, sub: range };
    }
    case 'bracket':
      return { competitionId: s.competitionId, sub: t('public.knockout') + pageSuffix(s) };
    case 'placements':
      return { competitionId: s.competitionId, sub: t('public.placements') };
    case 'entries':
      return { competitionId: s.competitionId, sub: t('display.entries', { n: stateOf(s.competitionId)?.entries.filter((e) => e.status !== 'withdrawn').length ?? 0 }) + pageSuffix(s) };
  }
  return null;
});
const headingCompetition = computed(() => (heading.value?.competitionId ? competitionOf(heading.value.competitionId) : undefined));

const placementsState = computed(() => (current.value?.kind === 'placements' ? stateOf(current.value.competitionId) : undefined));
const { name: placementName } = useCompetitionText(() => placementsState.value ?? ({ entries: [], matches: [] } as unknown as CompetitionStateInfo));
</script>

<template>
  <DisplayStage
    :background="branding.displayBackgroundId ? assetUrl(branding.displayBackgroundId) : null"
    :dim="branding.displayDim ?? DEFAULT_DISPLAY_DIM"
  >
    <div class="d-screen" :class="{ 'hide-cursor': !controlsVisible }" @mousemove="showControls">
      <header class="d-head">
        <img v-if="branding.logoId" :src="assetUrl(branding.logoId)" alt="" class="d-logo" />
        <h1>{{ live.overview.value?.event.name ?? live.locked.value?.name }}</h1>
        <div class="d-meta">
          <span v-if="profile" class="d-profile">{{ profile.name }}</span>
          <span v-else-if="profileMissing && !live.locked.value" class="d-profile warning-text">{{ t('display.profileMissing') }}</span>
          <StreamBadge v-if="!live.locked.value" :status="live.status.value" />
          <span class="d-clock">{{ clock }}</span>
        </div>
      </header>

      <h2 v-if="heading" class="d-title">
        <template v-if="headingCompetition">
          <span class="swatch" :style="{ background: `var(--series-${headingCompetition.color + 1})` }" aria-hidden="true"></span>
          {{ headingCompetition.name }}
          <span v-if="heading.sub" class="d-sub">· {{ heading.sub }}</span>
        </template>
        <template v-else>{{ heading.sub }}</template>
      </h2>

      <main v-if="live.locked.value" class="d-body d-locked">
        <ViewerGate />
      </main>
      <main v-else class="d-body">
        <FitBox v-if="reveal" :key="`reveal-${reveal.competitionId}`">
          <DisplayGroups
            v-if="revealGroups"
            :state="reveal.state"
            :groups="revealGroups.groups"
            :columns="revealGroups.columns"
            :revealed="revealGroups.revealed"
            :latest="revealGroups.latest"
          />
          <DisplayBracket
            v-else-if="reveal.mode === 'bracket'"
            :state="reveal.state"
            :from="0"
            :to="1"
            :revealed="reveal.step"
          />
          <DisplayEntries v-else :state="reveal.state" :entry-ids="reveal.order" :revealed-halves="reveal.step" />
        </FitBox>

        <FitBox v-else-if="current && live.operations.value" :key="current.key">
          <div v-if="current.kind === 'tables'" class="d-tables">
            <template v-for="id in current.tableIds" :key="id">
              <TableCard v-if="tablesById.get(id)" :table="tablesById.get(id)!" :competitions="operationsCompetitions" :now="now" large />
            </template>
          </div>

          <template v-else-if="current.kind === 'next'">
            <ol v-if="nextMatches.length > 0" class="d-next">
              <li v-for="m in nextMatches" :key="m.id">
                <span class="swatch" :style="{ background: `var(--series-${(operationsCompetitions.get(m.competitionId)?.color ?? 0) + 1})` }" aria-hidden="true"></span>
                <span class="d-next-meta">{{ operationsCompetitions.get(m.competitionId)?.name }} · {{ matchLabel(t, m) }}</span>
                <span class="d-next-players">{{ m.sides[0]?.name }} – {{ m.sides[1]?.name }}</span>
              </li>
            </ol>
            <p v-else class="d-empty">{{ t('admin.desk.queueEmpty') }}</p>
          </template>

          <DisplayGroups
            v-else-if="current.kind === 'groups' && stateOf(current.competitionId)"
            :state="stateOf(current.competitionId)!"
            :groups="current.groups"
            :columns="current.columns"
          />

          <DisplayBracket
            v-else-if="current.kind === 'bracket' && stateOf(current.competitionId)"
            :state="stateOf(current.competitionId)!"
            :from="current.from"
            :to="current.to"
            :table-name="tableName"
          />

          <ol v-else-if="current.kind === 'placements' && placementsState" class="d-placements">
            <li v-for="p in placementsState.placements" :key="p.entryId" :class="{ podium: p.place <= 3 }">
              <span class="place">{{ p.place === p.placeTo ? `${p.place}.` : `${p.place}.–${p.placeTo}.` }}</span>
              {{ placementName(p.entryId) }}
            </li>
          </ol>

          <template v-else-if="current.kind === 'entries' && stateOf(current.competitionId)">
            <p class="d-note">{{ t('public.notDrawn') }}</p>
            <DisplayEntries :state="stateOf(current.competitionId)!" :entry-ids="current.entryIds" />
          </template>
        </FitBox>

        <p v-else-if="live.operations.value" class="d-empty">{{ t('display.nothing') }}</p>
      </main>

      <footer class="d-foot">
        <div v-if="!reveal && slides.length > 1" class="d-dots" aria-hidden="true">
          <template v-if="slides.length <= 24">
            <span v-for="(s, i) in slides" :key="s.key" class="dot" :class="{ active: i === currentIndex }"></span>
          </template>
          <span v-else class="d-count">{{ currentIndex + 1 }} / {{ slides.length }}</span>
        </div>
        <div
          v-if="!reveal && slides.length > 1"
          :key="`${current?.key}-${cycle}`"
          class="d-progress"
          :class="{ paused }"
          :style="{ animationDuration: `${settings.slideSeconds}s` }"
        ></div>
      </footer>

      <div class="d-controls" :class="{ visible: controlsVisible }">
        <button type="button" :aria-label="t('display.previous')" @click="previous">‹</button>
        <button type="button" :aria-label="t((reveal ? revealPaused : paused) ? 'display.play' : 'display.pause')" @click="togglePause">
          {{ (reveal ? revealPaused : paused) ? '▶' : '❚❚' }}
        </button>
        <button type="button" :aria-label="t('display.forward')" @click="next">›</button>
        <button type="button" class="wide" @click="toggleFullscreen">{{ t(isFullscreen ? 'display.exitFullscreen' : 'display.fullscreen') }}</button>
        <span class="d-keys">{{ t('display.keys') }}</span>
      </div>
      <p v-if="paused && !reveal" class="d-paused">{{ t('display.paused') }}</p>
    </div>
  </DisplayStage>
</template>
