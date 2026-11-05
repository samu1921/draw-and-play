<script setup lang="ts">
import { Award, ClipboardList, Clock, ListOrdered, Network } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';
import { placementsCsv, resultsCsv, type ScoresheetScope } from '../../lib/printData.js';

const { t: rawT, te, d, locale } = useI18n();
const t = rawT as Translate;
const live = injectLiveEvent();
const event = computed(() => live.overview.value!.event);
const competitions = computed(() => live.overview.value!.competitions);
const days = computed(() => [...new Set(competitions.value.map((c) => c.day).filter((x): x is string => x !== null))].sort());

const competitionId = ref('');
const scope = ref<ScoresheetScope>('called');
const day = ref('');
const maxPlace = ref(3);
const error = ref('');

/** Link to a print page with the chosen options */
function link(kind: string, extra: Record<string, string | number> = {}) {
  const query = new URLSearchParams();
  if (competitionId.value) query.set('competition', competitionId.value);
  for (const [key, value] of Object.entries(extra)) if (value !== '') query.set(key, String(value));
  const search = query.toString();
  return `/admin/events/${event.value.id}/print/${kind}${search ? `?${search}` : ''}`;
}

async function download(kind: 'placements' | 'results') {
  error.value = '';
  try {
    const drawn = competitions.value.filter((c) => c.drawn && (!competitionId.value || c.id === competitionId.value));
    const states = await Promise.all(drawn.map((c) => api<CompetitionStateInfo>('GET', `/api/competitions/${c.id}/state`)));
    // German Excel splits on semicolons, English Excel on commas
    const delimiter = locale.value.startsWith('de') ? ';' : ',';
    const csv = kind === 'placements' ? placementsCsv(t, states, delimiter) : resultsCsv(t, states, delimiter);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.value.slug}-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
</script>

<template>
  <div class="stack">
    <section class="card">
      <p class="muted">{{ t('print.intro') }}</p>
      <label class="field print-competition-select">
        <span>{{ t('print.competition') }}</span>
        <select v-model="competitionId">
          <option value="">{{ t('print.allCompetitions') }}</option>
          <option v-for="c in competitions" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
    </section>

    <div class="setup-grid">
      <section class="card" aria-labelledby="print-scoresheets">
        <h2 id="print-scoresheets"><ClipboardList aria-hidden="true" />{{ t('print.titles.scoresheets') }}</h2>
        <p class="muted">{{ t('print.hints.scoresheets') }}</p>
        <label class="field">
          <span>{{ t('print.scope') }}</span>
          <select v-model="scope">
            <option v-for="s in ['called', 'ready', 'open'] as const" :key="s" :value="s">{{ t(`print.scopes.${s}`) }}</option>
          </select>
        </label>
        <div><a class="button" :href="link('scoresheets', { scope })" target="_blank">{{ t('print.open') }}</a></div>
      </section>

      <section class="card" aria-labelledby="print-schedule">
        <h2 id="print-schedule"><Clock aria-hidden="true" />{{ t('print.titles.schedule') }}</h2>
        <p class="muted">{{ t('print.hints.schedule') }}</p>
        <label v-if="days.length > 0" class="field">
          <span>{{ t('print.day') }}</span>
          <select v-model="day">
            <option value="">–</option>
            <option v-for="x in days" :key="x" :value="x">{{ d(new Date(`${x}T12:00:00`)) }}</option>
          </select>
        </label>
        <div><a class="button" :href="link('schedule', { day })" target="_blank">{{ t('print.open') }}</a></div>
      </section>

      <section class="card" aria-labelledby="print-competitions">
        <h2 id="print-competitions"><Network aria-hidden="true" />{{ t('print.titles.competitions') }}</h2>
        <p class="muted">{{ t('print.hints.competitions') }}</p>
        <div><a class="button" :href="link('competitions')" target="_blank">{{ t('print.open') }}</a></div>
      </section>

      <section class="card" aria-labelledby="print-results">
        <h2 id="print-results"><ListOrdered aria-hidden="true" />{{ t('print.titles.results') }}</h2>
        <p class="muted">{{ t('print.hints.results') }}</p>
        <div class="button-row">
          <a class="button" :href="link('results')" target="_blank">{{ t('print.open') }}</a>
          <button type="button" class="button secondary" @click="download('placements')">{{ t('print.csvPlacements') }}</button>
          <button type="button" class="button secondary" @click="download('results')">{{ t('print.csvResults') }}</button>
        </div>
      </section>

      <section class="card" aria-labelledby="print-certificates">
        <h2 id="print-certificates"><Award aria-hidden="true" />{{ t('print.titles.certificates') }}</h2>
        <p class="muted">{{ t('print.hints.certificates') }}</p>
        <label class="field">
          <span>{{ t('print.maxPlace') }}</span>
          <input v-model.number="maxPlace" type="number" min="1" max="16" />
        </label>
        <div><a class="button" :href="link('certificates', { places: maxPlace })" target="_blank">{{ t('print.open') }}</a></div>
      </section>
    </div>

    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </div>
</template>
