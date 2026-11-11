<script setup lang="ts">
import { groupLetter } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCompetitionText } from '../../composables/useCompetitionText.js';
import type { CompetitionStateInfo } from '../../lib/api.js';
import type { Translate } from '../../lib/describe.js';
import { tieSummary } from '../../lib/rules.js';

const props = defineProps<{
  state: CompetitionStateInfo;
  /** Group indexes on this slide */
  groups: number[];
  columns: number;
  /** Live draw: only these entries are shown yet, the other places stay empty */
  revealed?: ReadonlySet<string>;
  /** The entry revealed last, highlighted */
  latest?: string | null;
  /** Below finished groups, one line per tie saying what decided it */
  tieNotes?: boolean;
}>();
const { t } = useI18n();
const { name } = useCompetitionText(() => props.state);

const shown = computed(() => props.groups.map((g) => props.state.groups[g]!));
const notes = (g: CompetitionStateInfo['groups'][number]) => {
  if (!props.tieNotes || props.revealed || !g.complete || !g.tieBreaks) return [];
  const rank = new Map(g.standings.map((r) => [r.entryId, r.rank]));
  return g.tieBreaks.map((tie) => tieSummary(t as Translate, tie, (id) => rank.get(id) ?? 0));
};
</script>

<template>
  <div class="d-groups" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
    <section v-for="g in shown" :key="g.group" class="d-group">
      <h3>
        {{ t('public.group', { group: groupLetter(g.group) }) }}
        <span v-if="g.complete && !revealed" class="badge">{{ t('public.complete') }}</span>
      </h3>
      <table class="d-table">
        <thead v-if="!revealed">
          <tr>
            <th class="num">{{ t('public.rank') }}</th>
            <th>{{ t('public.entry') }}</th>
            <th class="num">{{ t('public.played') }}</th>
            <th class="num">{{ t('public.record') }}</th>
            <th class="num">{{ t('public.games') }}</th>
          </tr>
        </thead>
        <tbody v-if="revealed">
          <tr v-for="(entryId, i) in g.entries" :key="entryId" :class="{ latest: entryId === latest }">
            <td class="num">{{ i + 1 }}</td>
            <th class="name">
              <span v-if="revealed.has(entryId)" class="reveal-in">{{ name(entryId) }}</span>
              <span v-else class="placeholder" aria-hidden="true"></span>
            </th>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="s in g.standings" :key="s.entryId">
            <td class="num">{{ s.rank }}</td>
            <th class="name">
              {{ name(s.entryId) }}<span v-if="s.withdrawn" class="d-withdrawn"> · {{ t('public.withdrawn') }}</span>
            </th>
            <td class="num">{{ s.played }}</td>
            <td class="num">{{ s.won }}:{{ s.lost }}</td>
            <td class="num">{{ s.gamesWon }}:{{ s.gamesLost }}</td>
          </tr>
        </tbody>
      </table>
      <ul v-if="notes(g).length > 0" class="d-tie-notes">
        <li v-for="(note, i) in notes(g)" :key="i">{{ note }}</li>
      </ul>
    </section>
  </div>
</template>
