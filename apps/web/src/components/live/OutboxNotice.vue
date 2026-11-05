<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PendingResult, ResultBody } from '../../lib/outbox.js';

defineProps<{ waiting: readonly PendingResult[]; refused: readonly PendingResult[] }>();
const emit = defineEmits<{ dismiss: [matchId: string] }>();
const { t, te } = useI18n();

const resultText = (body: ResultBody) => ('notation' in body ? body.notation : t('public.walkover'));
/** Refusals mean the match changed at the desk in the meantime; other codes get their own text where there is one. */
function reason(code: string) {
  if (['versionConflict', 'matchFinished', 'correctionsAdminOnly', 'notCalled', 'alreadyCalled', 'dependentMatchStarted'].includes(code)) {
    return t('outbox.changed');
  }
  return te(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic', { code });
}
</script>

<template>
  <section v-if="waiting.length > 0" class="card notice" role="status">
    <p>{{ t('outbox.waiting', waiting.length, { named: { n: waiting.length } }) }}</p>
    <ul class="outbox-list">
      <li v-for="item in waiting" :key="item.matchId">
        {{ item.label }} <strong>{{ resultText(item.body) }}</strong>
      </li>
    </ul>
  </section>
  <section v-for="item in refused" :key="item.matchId" class="card notice warning" role="alert">
    <p>
      <strong>{{ t('outbox.refused') }}</strong> {{ item.label }} <strong>{{ resultText(item.body) }}</strong>
    </p>
    <p>{{ reason(item.conflict!) }}</p>
    <div>
      <button type="button" class="button secondary small" @click="emit('dismiss', item.matchId)">{{ t('outbox.dismiss') }}</button>
    </div>
  </section>
</template>
