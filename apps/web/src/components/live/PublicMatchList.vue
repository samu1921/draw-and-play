<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MatchInfo, OperationsMatch } from '../../lib/api.js';
import { gameScores, scoreText } from '../../lib/competitionText.js';
import { matchLabel, type Translate } from '../../lib/describe.js';
import { formatClock } from '../../lib/time.js';

/** A match as the lists show it: the operations view's, or one of a competition's with its side names resolved */
export type ListMatch = Pick<OperationsMatch, 'competitionId' | 'key' | 'phase' | 'group' | 'round' | 'places' | 'status' | 'tableId' | 'finishedAt' | 'result' | 'busy'> &
  Pick<MatchInfo, 'withdrawal'> & {
    id: string;
    sides: [{ name: string } | null, { name: string } | null];
  };

const props = withDefaults(
  defineProps<{
    matches: ListMatch[];
    /** next: called and waiting matches, with table or expected start; recent: results with the time they finished */
    kind: 'next' | 'recent';
    competitions: Map<string, { name: string; color: number }>;
    /** Expected start per `competitionId:key` (minutes since midnight) and the forecast's "now" */
    planned?: ReadonlyMap<string, number>;
    plannedNow?: number | null;
    tableName?: (tableId: string) => string | undefined;
    /** Shown before "show all" */
    limit?: number;
    /** On a competition's own page the competition goes without saying */
    hideCompetition?: boolean;
    /** Show everything at once, e.g. while searching */
    expanded?: boolean;
  }>(),
  { limit: 8, plannedNow: null, planned: () => new Map(), tableName: () => undefined },
);
const { t } = useI18n();
const showAll = ref(false);
const shown = computed(() => (showAll.value || props.expanded ? props.matches : props.matches.slice(0, props.limit)));

const label = (m: ListMatch) => matchLabel(t as Translate, m);
function when(m: ListMatch): string {
  if (props.kind === 'recent') {
    if (!m.finishedAt) return '';
    const d = new Date(m.finishedAt);
    return t('public.clock', { time: formatClock(d.getHours() * 60 + d.getMinutes()) });
  }
  if (m.status === 'called') return m.tableId ? t('table.title', { name: props.tableName(m.tableId) ?? '' }) : t('public.playingNow');
  const start = props.planned.get(`${m.competitionId}:${m.key}`);
  if (start === undefined) return '';
  const due = props.plannedNow !== null && start <= props.plannedNow;
  // Due but a player is still at a table: "soon" would promise too much
  if (due) return m.busy ? '' : t('public.soon');
  return t('public.about', { time: formatClock(start) });
}
</script>

<template>
  <div class="public-matches">
    <ol class="pm-list" :class="kind">
      <li v-for="m in shown" :key="m.id" class="pm-item" :class="{ waiting: m.busy, playing: m.status === 'called' }">
        <span class="pm-when">{{ when(m) }}</span>
        <div class="pm-body">
          <span class="queue-meta">
            <template v-if="!hideCompetition">
              <span class="swatch" :style="{ background: `var(--series-${(competitions.get(m.competitionId)?.color ?? 0) + 1})` }" aria-hidden="true"></span>
              {{ competitions.get(m.competitionId)?.name }} ·
            </template>
            {{ label(m) }}
          </span>
          <span class="pm-players">
            <span :class="{ winner: m.result?.winner === 0 }">{{ m.sides[0]?.name ?? '—' }}</span>
            <span class="queue-vs"> – </span>
            <span :class="{ winner: m.result?.winner === 1 }">{{ m.sides[1]?.name ?? '—' }}</span>
          </span>
          <span v-if="m.result" class="pm-result">
            <strong>{{ scoreText(t as Translate, m) }}</strong>
            <span v-if="!m.result.walkover && !(m.withdrawal && m.phase === 'rotation')" class="muted">{{ gameScores(m) }}</span>
          </span>
          <span v-if="m.busy" class="busy-note">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
            {{ t('public.waiting') }}
          </span>
        </div>
      </li>
    </ol>
    <button v-if="!expanded && matches.length > limit" type="button" class="button secondary small pm-more" :aria-expanded="showAll" @click="showAll = !showAll">
      {{ showAll ? t('public.showLess') : t('public.showAll', { n: matches.length }) }}
    </button>
  </div>
</template>
