<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import type { CompetitionStateInfo } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { bracketWindow, mainBracketRounds } from '../../lib/displaySlides.js';

const props = defineProps<{
  state: CompetitionStateInfo;
  /** Part of the bracket on this slide, as fractions (0–1) of its height */
  from: number;
  to: number;
  tableName?: (tableId: string) => string | undefined;
  /** Live draw: first-round matches revealed so far (all when undefined) */
  revealed?: number;
}>();
const { t } = useI18n();
const { sideText, score, gameScores } = useCompetitionText(() => props.state);

const rounds = computed(() =>
  mainBracketRounds(props.state.matches).map((matches, r) => {
    const [start, end] = bracketWindow(matches.length, props.from, props.to);
    return { label: matchLabel(t, matches[0]!), matches: matches.slice(start, end).map((m, i) => ({ m, index: start + i })) };
  }),
);
const hidden = (round: number, index: number) => props.revealed !== undefined && round === 0 && index >= props.revealed;
</script>

<template>
  <div class="d-bracket">
    <div v-for="(round, r) in rounds" :key="r" class="d-round">
      <h4>{{ round.label }}</h4>
      <ol>
        <li v-for="{ m, index } in round.matches" :key="m.key" class="d-match" :class="[m.status, { hidden: hidden(r, index) }]">
          <div v-for="side in [0, 1] as const" :key="side" class="d-side" :class="{ winner: m.result && m.result.winner === side, open: !m.sides[side] }">
            <span v-if="hidden(r, index)" class="placeholder" aria-hidden="true"></span>
            <span v-else :class="{ 'reveal-in': revealed !== undefined && r === 0 }">{{ sideText(m, side) }}</span>
          </div>
          <div class="d-match-info">
            <template v-if="m.status === 'finished'">
              <strong>{{ score(m) }}</strong> <span class="muted">{{ gameScores(m) }}</span>
            </template>
            <template v-else-if="m.status === 'called' && m.tableId">{{ t('table.title', { name: tableName?.(m.tableId) ?? '' }) }}</template>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
