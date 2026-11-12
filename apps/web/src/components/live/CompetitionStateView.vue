<script setup lang="ts">
import { groupLetter } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import type { CompetitionStateInfo } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { placesText, signed } from '../../lib/rules.js';
import { bracketViews, placementGroupViews, swissRoundViews } from '../../lib/stages.js';
import GroupTieBreaks from './GroupTieBreaks.vue';

const props = defineProps<{
  state: CompetitionStateInfo;
  tableName?: (tableId: string) => string | undefined;
}>();
const { t } = useI18n();

const { name, sideText, score, gameScores } = useCompetitionText(() => props.state);

const isSwiss = computed(() => props.state.competition.format.swiss !== undefined);
/** Rounds of a Swiss system, the current one first */
const swissRounds = computed(() => swissRoundViews(props.state).filter((r) => r.paired).reverse());
const nextSwissRound = computed(() => swissRoundViews(props.state).find((r) => !r.paired));
/** Every bracket with its rounds as columns; matches for the lower places are listed below it */
const brackets = computed(() => bracketViews(props.state.matches));
/** Consolation fields of three: a table and its matches */
const placementGroups = computed(() => placementGroupViews(props.state));
/** Group ranks compared across the groups: who advances as one of the best, then what seeds the consolation */
const comparisons = computed(() => [...(props.state.nextRanked ? [props.state.nextRanked] : []), ...(props.state.seeding ?? [])]);
const bracketTitle = (b: { stage: string; places: [number, number] }) =>
  b.stage === 'KO' ? t('public.knockout') : `${t('public.consolation')} · ${t('public.consolationPlaces', { places: placesText(...b.places) })}`;

/** Per match, so that groups of different sizes compare: "+1.33" */
const perMatch = (value: number, played: number) => (played === 0 ? '0' : signed(Math.round((value / played) * 100) / 100));
const percent = (won: number, played: number) => (played === 0 ? '–' : `${Math.round((won / played) * 100)} %`);
</script>

<template>
  <div class="competition-state">
    <p v-if="!state.competition.drawn" class="muted">{{ t('public.notDrawn') }}</p>

    <div v-if="state.groups.length > 0" class="groups">
      <section v-for="g in state.groups" :key="g.group" class="group">
        <h3>
          {{ isSwiss ? t('public.table') : t('public.group', { group: groupLetter(g.group) }) }}
          <span v-if="g.complete" class="badge">{{ t('public.complete') }}</span>
        </h3>
        <div class="table-scroll">
          <table class="data-table standings">
            <thead>
              <tr>
                <th scope="col" class="num">{{ t('public.rank') }}</th>
                <th scope="col">{{ t('public.entry') }}</th>
                <th scope="col" class="num">{{ t('public.played') }}</th>
                <th scope="col" class="num">{{ t('public.record') }}</th>
                <th v-if="isSwiss" scope="col" class="num"><abbr :title="t('public.buchholzTitle')">{{ t('public.buchholz') }}</abbr></th>
                <th scope="col" class="num">{{ t('public.games') }}</th>
                <th scope="col" class="num">{{ t('public.points') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in g.standings" :key="row.entryId">
                <td class="num">{{ row.rank }}</td>
                <th scope="row">
                  {{ name(row.entryId) }}
                  <span v-if="row.withdrawn" class="badge quiet">{{ t('public.withdrawn') }}</span>
                </th>
                <td class="num">{{ row.played }}</td>
                <td class="num">{{ row.won }}:{{ row.lost }}</td>
                <td v-if="isSwiss" class="num">{{ row.buchholz ?? 0 }}</td>
                <td class="num">{{ row.gamesWon }}:{{ row.gamesLost }}</td>
                <td class="num">{{ row.pointsWon }}:{{ row.pointsLost }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <GroupTieBreaks :state="state" :group="g.group" />
      </section>
    </div>

    <section v-for="c in comparisons" :key="c.rank" class="next-ranked">
      <h3>
        {{ t('public.nextRanked', { rank: c.rank }) }}
        <span v-if="c.complete" class="badge">{{ t('public.complete') }}</span>
      </h3>
      <p class="muted">
        {{ c.advancing > 0 ? t('public.nextRankedHint', c.advancing, { named: { n: c.advancing } }) : t('public.seedingHint') }}
        <template v-if="c.comparedSize">{{ ' ' + t('public.nextRankedCompared', { n: c.comparedSize }) }}</template>
        <template v-if="!c.complete">{{ ' ' + t('public.nextRankedProvisional') }}</template>
      </p>
      <div class="table-scroll">
        <table class="data-table standings">
          <thead>
            <tr>
              <th scope="col" class="num">{{ t('public.rank') }}</th>
              <th scope="col">{{ t('public.entry') }}</th>
              <th scope="col" class="num">{{ t('public.groupShort') }}</th>
              <th scope="col" class="num">{{ t('public.record') }}</th>
              <th scope="col" class="num">{{ t('public.winRatio') }}</th>
              <th scope="col" class="num">{{ t('public.gamesPerMatch') }}</th>
              <th scope="col" class="num">{{ t('public.pointsPerMatch') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="({ group, row }, i) in c.rows" :key="row.entryId" :class="{ advancing: i < c.advancing }">
              <td class="num">{{ i + 1 }}</td>
              <th scope="row">
                {{ name(row.entryId) }}
                <span v-if="row.withdrawn" class="badge quiet">{{ t('public.withdrawn') }}</span>
                <span v-else-if="i < c.advancing && c.complete" class="badge">{{ t('public.advances') }}</span>
              </th>
              <td class="num">{{ groupLetter(group) }}</td>
              <td class="num">{{ row.won }}:{{ row.lost }}</td>
              <td class="num">{{ percent(row.won, row.played) }}</td>
              <td class="num">{{ perMatch(row.gamesWon - row.gamesLost, row.played) }}</td>
              <td class="num">{{ perMatch(row.pointsWon - row.pointsLost, row.played) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="isSwiss && state.swiss" class="swiss-rounds">
      <h3>{{ t('public.rounds') }}</h3>
      <p v-if="nextSwissRound" class="muted">
        {{ t('public.roundOfTotal', { round: nextSwissRound.round, total: state.swiss.rounds }) }}:
        {{ t('public.roundPending', { previous: nextSwissRound.round - 1 }) }}
      </p>
      <details v-for="(r, i) in swissRounds" :key="r.round" class="swiss-round" :open="i === 0">
        <summary>{{ t('public.roundOfTotal', { round: r.round, total: state.swiss.rounds }) }}</summary>
        <ul class="placement-matches">
          <li v-for="m in r.matches" :key="m.key">
            <span :class="{ winner: m.result?.winner === 0 }">{{ sideText(m, 0) }}</span> –
            <span :class="{ winner: m.result?.winner === 1 }">{{ sideText(m, 1) }}</span>{{ ' ' }}
            <template v-if="m.status === 'finished'">
              <strong>{{ score(m) }}</strong> <span class="muted">{{ gameScores(m) }}</span>
            </template>
            <span v-else-if="m.status === 'called' && m.tableId" class="muted">{{ t('table.title', { name: tableName?.(m.tableId) ?? '' }) }}</span>
          </li>
          <li v-if="r.bye" class="muted">{{ t('public.bye', { name: name(r.bye) }) }}</li>
        </ul>
      </details>
    </section>

    <section v-for="b in brackets" :key="b.stage" class="bracket-section">
      <h3>{{ bracketTitle(b) }}</h3>
      <div class="bracket">
        <div v-for="(round, i) in b.rounds" :key="i" class="bracket-round">
          <h4>{{ matchLabel(t, round[0]!) }}</h4>
          <ol class="bracket-matches">
            <li v-for="m in round" :key="m.key" class="bracket-match" :class="m.status">
              <div
                v-for="side in [0, 1] as const"
                :key="side"
                class="bracket-side"
                :class="{ winner: m.result && m.result.winner === side, open: !m.sides[side] }"
              >
                <span>{{ sideText(m, side) }}</span>
              </div>
              <div class="bracket-info">
                <template v-if="m.status === 'finished'">
                  <strong>{{ score(m) }}</strong> <span class="muted">{{ gameScores(m) }}</span>
                </template>
                <template v-else-if="m.status === 'called' && m.tableId">{{ t('table.title', { name: tableName?.(m.tableId) ?? '' }) }}</template>
                <template v-else>{{ t('public.open') }}</template>
              </div>
            </li>
          </ol>
        </div>
      </div>
      <ul v-if="b.placementMatches.length > 0" class="placement-matches">
        <li v-for="m in b.placementMatches" :key="m.key">
          <span class="muted">{{ matchLabel(t, m) }}:</span>
          {{ sideText(m, 0) }} – {{ sideText(m, 1) }}
          <strong v-if="m.status === 'finished'">{{ score(m) }}</strong>
        </li>
      </ul>
    </section>

    <section v-for="f in placementGroups" :key="f.stage" class="group placement-group">
      <h3>
        {{ t('public.consolation') }} · {{ t('public.consolationPlaces', { places: placesText(...f.places) }) }}
        <span v-if="f.group.complete" class="badge">{{ t('public.complete') }}</span>
      </h3>
      <p class="muted">{{ t('public.placementGroupHint') }}</p>
      <div v-if="f.group.standings.length > 0" class="table-scroll">
        <table class="data-table standings">
          <thead>
            <tr>
              <th scope="col" class="num">{{ t('public.rank') }}</th>
              <th scope="col">{{ t('public.entry') }}</th>
              <th scope="col" class="num">{{ t('public.played') }}</th>
              <th scope="col" class="num">{{ t('public.record') }}</th>
              <th scope="col" class="num">{{ t('public.games') }}</th>
              <th scope="col" class="num">{{ t('public.points') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in f.group.standings" :key="row.entryId">
              <td class="num">{{ f.places[0] + i }}</td>
              <th scope="row">
                {{ name(row.entryId) }}
                <span v-if="row.withdrawn" class="badge quiet">{{ t('public.withdrawn') }}</span>
              </th>
              <td class="num">{{ row.played }}</td>
              <td class="num">{{ row.won }}:{{ row.lost }}</td>
              <td class="num">{{ row.gamesWon }}:{{ row.gamesLost }}</td>
              <td class="num">{{ row.pointsWon }}:{{ row.pointsLost }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <GroupTieBreaks :state="state" :stage="f.stage" />
      <ul class="placement-matches">
        <li v-for="m in f.matches" :key="m.key">
          <span :class="{ winner: m.result?.winner === 0 }">{{ sideText(m, 0) }}</span> –
          <span :class="{ winner: m.result?.winner === 1 }">{{ sideText(m, 1) }}</span>{{ ' ' }}
          <template v-if="m.status === 'finished'">
            <strong>{{ score(m) }}</strong> <span class="muted">{{ gameScores(m) }}</span>
          </template>
          <span v-else-if="m.status === 'called' && m.tableId" class="muted">{{ t('table.title', { name: tableName?.(m.tableId) ?? '' }) }}</span>
        </li>
      </ul>
    </section>

    <section v-if="state.placements.length > 0" class="placements">
      <h3>{{ t('public.placements') }}</h3>
      <ol class="placement-list">
        <li v-for="p in state.placements" :key="p.entryId">
          <span class="place">{{ p.place === p.placeTo ? `${p.place}.` : `${p.place}.–${p.placeTo}.` }}</span>
          {{ name(p.entryId) }}
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.swiss-round {
  margin-top: 0.5rem;
}
.swiss-round summary {
  cursor: pointer;
  font-weight: 600;
}
.swiss-round .winner,
.placement-group .winner,
.next-ranked .advancing th {
  font-weight: 700;
}
</style>
