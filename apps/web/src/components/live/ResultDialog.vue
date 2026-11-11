<script setup lang="ts">
import type { MatchRules, SportProfile } from '@draw-and-play/domain';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ResultOutbox } from '../../composables/useResultOutbox.js';
import { api, type OperationsMatch } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';
import ResultKeypad from './ResultKeypad.vue';

const props = defineProps<{
  match: OperationsMatch | null;
  rules: MatchRules | undefined;
  sport: SportProfile;
  /** Sends the result, or keeps it for later while the connection is down */
  outbox: ResultOutbox;
  /** Competition name, shown with the result while it waits */
  competitionName?: string;
  /** The desk may also record walkovers */
  allowWalkover?: boolean;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const { t, te } = useI18n();

const dialog = ref<HTMLDialogElement | null>(null);
const notation = ref('');
const error = ref('');
const busy = ref(false);
const names = computed<[string, string]>(() => [props.match?.sides[0]?.name ?? '', props.match?.sides[1]?.name ?? '']);
const complete = computed(() => {
  if (!props.rules || !notation.value.trim()) return false;
  const parsed = props.sport.parseResult(notation.value, props.rules);
  return parsed.ok && parsed.outcome.status === 'finished';
});

watch(
  () => props.match,
  (match) => {
    notation.value = match?.result && !match.result.walkover ? match.result.games.map(([a, b]) => (a > b ? `${b}` : `-${a}`)).join(' ') : '';
    error.value = '';
    if (match) dialog.value?.showModal();
    else dialog.value?.close();
  },
);

/** A player leaves the tournament: take the match off the table if needed, then withdraw the entry */
async function withdraw(side: 0 | 1) {
  const match = props.match;
  const entry = match?.sides[side];
  if (!match || !entry || !confirm(t('result.withdrawConfirm', { name: entry.name }))) return;
  busy.value = true;
  error.value = '';
  try {
    if (match.status === 'called') await api('POST', `/api/matches/${match.id}/uncall`, { version: match.version });
    await api('POST', `/api/entries/${entry.entryId}/withdraw`);
    emit('saved');
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
  }
}

async function save(body: { notation: string } | { walkoverWinner: 0 | 1 }) {
  if (!props.match) return;
  // DTTB WO D 7.9: whoever does not turn up is out of the competition, and their group matches are annulled
  if ('walkoverWinner' in body) {
    const loser = names.value[1 - body.walkoverWinner];
    if (!confirm(t('result.walkoverConfirm', { name: loser }))) return;
  }
  busy.value = true;
  error.value = '';
  try {
    await props.outbox.submit({
      matchId: props.match.id,
      version: props.match.version,
      body,
      label: `${props.competitionName ? `${props.competitionName} · ` : ''}${matchLabel(t, props.match)}: ${names.value[0]} – ${names.value[1]}`,
    });
    emit('saved');
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <dialog ref="dialog" class="dialog" @close="emit('close')">
    <form v-if="match && rules" method="dialog" class="stack" @submit.prevent="save({ notation })">
      <h2>{{ matchLabel(t, match) }}</h2>
      <p class="players">
        <strong>{{ names[0] }}</strong> <span class="muted">{{ t('public.vs') }}</span> <strong>{{ names[1] }}</strong>
      </p>
      <ResultKeypad v-model="notation" :rules="rules" :sport="sport" :sides="names" />
      <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
      <div class="button-row">
        <button type="submit" class="button" :disabled="!complete || busy">{{ t('result.submit') }}</button>
        <button type="button" class="button secondary" @click="emit('close')">{{ t('common.cancel') }}</button>
      </div>
      <div v-if="allowWalkover" class="button-row">
        <button v-for="side in [0, 1] as const" :key="side" type="button" class="button secondary small" :disabled="busy" @click="save({ walkoverWinner: side })">
          {{ t('result.walkover', { name: names[side] }) }}
        </button>
      </div>
      <div v-if="allowWalkover" class="button-row">
        <button v-for="side in [0, 1] as const" :key="side" type="button" class="button secondary small" :disabled="busy" @click="withdraw(side)">
          {{ t('result.withdraw', { name: names[side] }) }}
        </button>
      </div>
    </form>
  </dialog>
</template>
