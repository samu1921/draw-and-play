<script setup lang="ts">
import { groupLetter } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo } from '../../lib/api.js';
import { competitionText } from '../../lib/competitionText.js';
import { matchLabel, type Translate } from '../../lib/describe.js';
import { crossTable, placeText } from '../../lib/printData.js';
import { placesText } from '../../lib/rules.js';
import { bracketViews, placementGroupViews, rotationRoundViews, swissRoundViews } from '../../lib/stages.js';

const props = defineProps<{ states: CompetitionStateInfo[] }>();
const { t: rawT } = useI18n();
const t = rawT as Translate;

const sections = computed(() =>
  props.states.map((state) => ({
    state,
    text: competitionText(t, state),
    // A Swiss table is far too sparse for a cross table, and with rotating partners nobody plays anybody alone:
    // both are printed as a table with the rounds below
    groups: (state.swiss || state.competition.format.rotation ? [] : state.groups).map((g) => ({
      group: g,
      cross: crossTable(t, state, g.group),
      standing: new Map(g.standings.map((s) => [s.entryId, s])),
    })),
    swissTable: state.swiss || state.competition.format.rotation ? state.groups[0] : undefined,
    buchholz: state.swiss !== undefined && state.swiss !== null,
    swissRounds: state.competition.format.rotation
      ? rotationRoundViews(state).map((r) => ({ round: r.round, matches: r.matches, bye: null, resting: r.resting }))
      : swissRoundViews(state)
          .filter((r) => r.paired)
          .map((r) => ({ ...r, resting: [] as string[] })),
    brackets: bracketViews(state.matches),
    fields: placementGroupViews(state),
  })),
);
const bracketTitle = (b: { stage: string; places: [number, number] }) =>
  b.stage === 'KO' ? t('public.knockout') : `${t('public.consolation')} · ${t('public.consolationPlaces', { places: placesText(...b.places) })}`;
</script>

<template>
  <section v-for="s in sections" :key="s.state.competition.id" class="print-competition">
    <h2>{{ s.state.competition.name }}</h2>

    <div v-for="{ group, cross, standing } in s.groups" :key="group.group" class="print-group">
      <h3>{{ t('public.group', { group: groupLetter(group.group) }) }}</h3>
      <table class="data-table print-table cross-table">
        <thead>
          <tr>
            <th scope="col" class="num">{{ t('public.rank') }}</th>
            <th scope="col">{{ t('public.entry') }}</th>
            <th v-for="(_, i) in cross.entries" :key="i" scope="col" class="num">{{ i + 1 }}</th>
            <th scope="col" class="num">{{ t('public.record') }}</th>
            <th scope="col" class="num">{{ t('public.games') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, row) in cross.entries" :key="entry.id">
            <td class="num">{{ group.complete ? entry.rank : '' }}</td>
            <th scope="row">{{ row + 1 }}. {{ entry.name }}</th>
            <td v-for="(cell, column) in cross.cells[row]" :key="column" class="num" :class="{ diagonal: cell === null }">{{ cell ?? '' }}</td>
            <td class="num">{{ standing.get(entry.id)?.won ?? 0 }}:{{ standing.get(entry.id)?.lost ?? 0 }}</td>
            <td class="num">{{ standing.get(entry.id)?.gamesWon ?? 0 }}:{{ standing.get(entry.id)?.gamesLost ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="s.swissTable" class="print-group">
      <h3>{{ t('public.table') }}</h3>
      <table class="data-table print-table">
        <thead>
          <tr>
            <th scope="col" class="num">{{ t('public.rank') }}</th>
            <th scope="col">{{ t('public.entry') }}</th>
            <th scope="col" class="num">{{ t('public.record') }}</th>
            <th v-if="s.buchholz" scope="col" class="num">{{ t('public.buchholz') }}</th>
            <th scope="col" class="num">{{ t('public.games') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in s.swissTable.standings" :key="row.entryId">
            <td class="num">{{ row.rank }}</td>
            <th scope="row">{{ s.text.name(row.entryId) }}</th>
            <td class="num">{{ row.won }}:{{ row.lost }}</td>
            <td v-if="s.buchholz" class="num">{{ row.buchholz ?? 0 }}</td>
            <td class="num">{{ row.gamesWon }}:{{ row.gamesLost }}</td>
          </tr>
        </tbody>
      </table>
      <div v-for="r in s.swissRounds" :key="r.round">
        <h4>{{ t('match.swiss', { round: r.round }) }}</h4>
        <ul class="placement-matches">
          <li v-for="m in r.matches" :key="m.key">
            {{ s.text.sideText(m, 0) }} – {{ s.text.sideText(m, 1) }}
            <strong>{{ s.text.score(m) }}</strong> <span class="muted small">{{ s.text.gameScores(m) }}</span>
          </li>
          <li v-if="r.bye">{{ t('public.bye', { name: s.text.name(r.bye) }) }}</li>
          <li v-if="r.resting.length > 0">{{ t('public.resting', { names: r.resting.map(s.text.name).join(', ') }) }}</li>
        </ul>
      </div>
    </div>

    <div v-for="b in s.brackets" :key="b.stage" class="print-bracket">
      <h3>{{ bracketTitle(b) }}</h3>
      <div class="print-bracket-rounds">
        <div v-for="(round, i) in b.rounds" :key="i" class="print-bracket-round">
          <h4>{{ matchLabel(t, round[0]!) }}</h4>
          <div v-for="m in round" :key="m.key" class="print-bracket-match">
            <div v-for="side in [0, 1] as const" :key="side" :class="{ winner: m.result?.winner === side }">{{ s.text.sideText(m, side) }}</div>
            <div v-if="m.result" class="muted small">{{ s.text.score(m) }} {{ s.text.gameScores(m) }}</div>
          </div>
        </div>
      </div>
      <ul v-if="b.placementMatches.length > 0" class="placement-matches">
        <li v-for="m in b.placementMatches" :key="m.key">
          {{ s.text.numberedLabel(m.key) }}: {{ s.text.sideText(m, 0) }} – {{ s.text.sideText(m, 1) }}
          <strong>{{ s.text.score(m) }}</strong>
        </li>
      </ul>
    </div>

    <div v-for="f in s.fields" :key="f.stage" class="print-group">
      <h3>{{ t('public.consolation') }} · {{ t('public.consolationPlaces', { places: placesText(...f.places) }) }}</h3>
      <table v-if="f.group.standings.length > 0" class="data-table print-table">
        <thead>
          <tr>
            <th scope="col" class="num">{{ t('public.rank') }}</th>
            <th scope="col">{{ t('public.entry') }}</th>
            <th scope="col" class="num">{{ t('public.record') }}</th>
            <th scope="col" class="num">{{ t('public.games') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in f.group.standings" :key="row.entryId">
            <td class="num">{{ f.group.complete ? f.places[0] + i : '' }}</td>
            <th scope="row">{{ s.text.name(row.entryId) }}</th>
            <td class="num">{{ row.won }}:{{ row.lost }}</td>
            <td class="num">{{ row.gamesWon }}:{{ row.gamesLost }}</td>
          </tr>
        </tbody>
      </table>
      <ul class="placement-matches">
        <li v-for="m in f.matches" :key="m.key">
          {{ s.text.sideText(m, 0) }} – {{ s.text.sideText(m, 1) }}
          <strong>{{ s.text.score(m) }}</strong> <span class="muted small">{{ s.text.gameScores(m) }}</span>
        </li>
      </ul>
    </div>

    <div v-if="s.state.placements.length > 0" class="print-placements">
      <h3>{{ t('public.placements') }}</h3>
      <ol class="placement-list">
        <li v-for="p in s.state.placements" :key="p.entryId">
          <span class="place">{{ placeText(p) }}</span> {{ s.text.name(p.entryId) }}
        </li>
      </ol>
    </div>
  </section>
</template>
