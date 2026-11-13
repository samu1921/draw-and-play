<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo } from '../../lib/api.js';

const props = defineProps<{
  state: CompetitionStateInfo;
  entryIds: string[];
  /** Live pair draw: pairs revealed so far, counted in halves (seeded player, then the drawn partner) */
  revealedHalves?: number;
}>();
const { t } = useI18n();

const byId = computed(() => new Map(props.state.entries.map((e) => [e.id, e])));
const rows = computed(() =>
  props.entryIds.flatMap((id) => {
    const e = byId.value.get(id);
    if (!e) return [];
    const clubs = [...new Set(e.members.map((m) => m.club).filter(Boolean))].join(' / ');
    return [{ id, members: e.members.map((m) => m.name), clubs }];
  }),
);
const shownMembers = (i: number) => (props.revealedHalves === undefined ? 2 : Math.max(0, Math.min(2, props.revealedHalves - 2 * i)));
</script>

<template>
  <ol class="d-entries" :class="{ pairs: revealedHalves !== undefined }">
    <li v-for="(e, i) in rows" :key="e.id" :class="{ hidden: shownMembers(i) === 0 }">
      <template v-if="revealedHalves === undefined">
        <span class="name">{{ e.members.join(' / ') }}</span>
        <span v-if="state.competition.kind === 'doubles' && e.members.length === 1" class="muted"> · {{ t('admin.competition.noPartner') }}</span>
        <span v-if="e.clubs" class="club">{{ e.clubs }}</span>
      </template>
      <template v-else>
        <!-- Hidden names stay in the layout: every step of the draw keeps the same size -->
        <template v-for="(member, half) in [e.members[0], e.members[1]]" :key="half">
          <span v-if="half === 1" class="plus" aria-hidden="true">+</span>
          <span class="name reveal-slot">
            <span :class="shownMembers(i) > half ? 'reveal-in' : 'concealed'">{{ member }}</span>
            <span v-if="shownMembers(i) <= half" class="placeholder" aria-hidden="true"></span>
          </span>
        </template>
      </template>
    </li>
  </ol>
</template>
