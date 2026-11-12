<script setup lang="ts">
import { formatCapabilities, type CompetitionFormat } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { describePlacements } from '../lib/describe.js';
import type { FormatForm } from '../lib/formatForm.js';

/**
 * The settings of the chosen format, as form fields for a `.fields` grid. Only what has an effect on the format
 * is offered: rounds for a Swiss system, placement matches for a knockout, and after a group stage whether the
 * best of the next group rank fill the bracket and what the eliminated entries do.
 */
const props = defineProps<{
  /** The chosen format, or undefined while none fits the entries */
  format: CompetitionFormat | undefined;
  entryCount: number;
}>();
const form = defineModel<FormatForm>({ required: true });
const { t } = useI18n();

const capabilities = computed(() => (props.format ? formatCapabilities(props.format, props.entryCount) : null));
const nextRank = computed(() => (props.format?.knockout?.qualifiersPerGroup ?? 0) + 1);
const set = <K extends keyof FormatForm>(key: K, value: FormatForm[K]) => (form.value = { ...form.value, [key]: value });

function onRounds(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  set('swissRounds', Number.isInteger(value) && value > 0 ? value : null);
}
</script>

<template>
  <label v-if="capabilities?.swissRounds" class="field">
    <span>{{ t('planner.competitions.swissRounds') }}</span>
    <input
      type="number"
      min="1"
      :max="capabilities.swissRounds.max"
      inputmode="numeric"
      :value="format?.swiss?.rounds ?? capabilities.swissRounds.recommended"
      @change="onRounds"
    />
    <small class="muted">{{ t('planner.competitions.swissRoundsHint', { n: capabilities.swissRounds.recommended }) }}</small>
  </label>
  <label v-if="capabilities?.placements" class="field">
    <span>{{ t('planner.competitions.placements') }}</span>
    <select :value="form.placements" @change="set('placements', ($event.target as HTMLSelectElement).value as FormatForm['placements'])">
      <option v-for="mode in ['none', 'thirdPlace', 'all'] as const" :key="mode" :value="mode">{{ describePlacements(t, mode) }}</option>
    </select>
  </label>
  <label v-if="capabilities?.fillByes" class="field">
    <span>{{ t('planner.competitions.fillByes') }}</span>
    <select :value="form.fillByes ? 'on' : 'off'" @change="set('fillByes', ($event.target as HTMLSelectElement).value === 'on')">
      <option value="off">{{ t('planner.competitions.fillByesModes.off') }}</option>
      <option value="on">{{ t('planner.competitions.fillByesModes.on', { rank: nextRank }) }}</option>
    </select>
  </label>
  <label v-if="capabilities?.consolation" class="field">
    <span>{{ t('planner.competitions.consolation') }}</span>
    <select :value="form.consolation" @change="set('consolation', ($event.target as HTMLSelectElement).value as FormatForm['consolation'])">
      <option v-for="mode in ['none', 'bracket', 'perRank'] as const" :key="mode" :value="mode">{{ t(`planner.competitions.consolationModes.${mode}`) }}</option>
    </select>
  </label>
</template>
