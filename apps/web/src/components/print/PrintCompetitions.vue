<script setup lang="ts">
import { groupLetter } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo } from '../../lib/api.js';
import { competitionText } from '../../lib/competitionText.js';
import { matchLabel, type Translate } from '../../lib/describe.js';
import { mainBracketRounds } from '../../lib/displaySlides.js';
import { crossTable, placeText } from '../../lib/printData.js';

const props = defineProps<{ states: CompetitionStateInfo[] }>();
const { t: rawT } = useI18n();
const t = rawT as Translate;

const sections = computed(() =>
  props.states.map((state) => ({
    state,
    text: competitionText(t, state),
    groups: state.groups.map((g) => ({
      group: g,
      cross: crossTable(t, state, g.group),
      standing: new Map(g.standings.map((s) => [s.entryId, s])),
    })),
    rounds: mainBracketRounds(state.matches),
    placementMatches: state.matches.filter((m) => m.phase === 'knockout' && (m.places?.[0] ?? 1) > 1),
  })),
);
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

    <div v-if="s.rounds.length > 0" class="print-bracket">
      <h3>{{ t('public.knockout') }}</h3>
      <div class="print-bracket-rounds">
        <div v-for="(round, i) in s.rounds" :key="i" class="print-bracket-round">
          <h4>{{ matchLabel(t, round[0]!) }}</h4>
          <div v-for="m in round" :key="m.key" class="print-bracket-match">
            <div v-for="side in [0, 1] as const" :key="side" :class="{ winner: m.result?.winner === side }">{{ s.text.sideText(m, side) }}</div>
            <div v-if="m.result" class="muted small">{{ s.text.score(m) }} {{ s.text.gameScores(m) }}</div>
          </div>
        </div>
      </div>
      <ul v-if="s.placementMatches.length > 0" class="placement-matches">
        <li v-for="m in s.placementMatches" :key="m.key">
          {{ s.text.numberedLabel(m.key) }}: {{ s.text.sideText(m, 0) }} – {{ s.text.sideText(m, 1) }}
          <strong>{{ s.text.score(m) }}</strong>
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
