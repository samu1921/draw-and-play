<script setup lang="ts">
import { groupLetter } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import type { CompetitionStateInfo } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { mainBracketRounds } from '../../lib/displaySlides.js';

const props = defineProps<{
  state: CompetitionStateInfo;
  tableName?: (tableId: string) => string | undefined;
}>();
const { t } = useI18n();

const { name, sideText, score, gameScores } = useCompetitionText(() => props.state);

/** Main bracket rounds as columns; placement matches listed separately */
const bracketRounds = computed(() => mainBracketRounds(props.state.matches));
const placementMatches = computed(() => props.state.matches.filter((m) => m.phase === 'knockout' && (m.places?.[0] ?? 1) > 1));
</script>

<template>
  <div class="competition-state">
    <p v-if="!state.competition.drawn" class="muted">{{ t('public.notDrawn') }}</p>

    <div v-if="state.groups.length > 0" class="groups">
      <section v-for="g in state.groups" :key="g.group" class="group">
        <h3>
          {{ t('public.group', { group: groupLetter(g.group) }) }}
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
                <th scope="col" class="num">{{ t('public.games') }}</th>
                <th scope="col" class="num">{{ t('public.points') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in g.standings" :key="row.entryId">
                <td class="num">{{ row.rank }}</td>
                <th scope="row">{{ name(row.entryId) }}</th>
                <td class="num">{{ row.played }}</td>
                <td class="num">{{ row.won }}:{{ row.lost }}</td>
                <td class="num">{{ row.gamesWon }}:{{ row.gamesLost }}</td>
                <td class="num">{{ row.pointsWon }}:{{ row.pointsLost }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section v-if="bracketRounds.length > 0" class="bracket-section">
      <h3>{{ t('public.knockout') }}</h3>
      <div class="bracket">
        <div v-for="(round, i) in bracketRounds" :key="i" class="bracket-round">
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
      <ul v-if="placementMatches.length > 0" class="placement-matches">
        <li v-for="m in placementMatches" :key="m.key">
          <span class="muted">{{ matchLabel(t, m) }}:</span>
          {{ sideText(m, 0) }} – {{ sideText(m, 1) }}
          <strong v-if="m.status === 'finished'">{{ score(m) }}</strong>
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
