<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { errorText } from '../../lib/messages.js';

/**
 * Shown instead of a public page while it needs the viewer code. A link with `?code=` (the QR code on the notice)
 * opens the page right away; the code is taken out of the address afterwards.
 */
const { t, te } = useI18n();
const live = injectLiveEvent();
const route = useRoute();
const router = useRouter();
const code = ref('');
const busy = ref(false);
const error = ref('');

async function submit(value = code.value) {
  busy.value = true;
  error.value = '';
  try {
    await live.unlock(value);
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  const fromLink = route.query.code;
  if (typeof fromLink !== 'string' || !fromLink) return;
  const { code: _, ...query } = route.query;
  await router.replace({ query });
  await submit(fromLink);
});
</script>

<template>
  <form class="card stack viewer-gate" @submit.prevent="submit()">
    <p v-if="live.locked.value?.name" class="muted small">{{ live.locked.value.name }}</p>
    <h2>{{ t('viewer.title') }}</h2>
    <p class="muted">{{ t('viewer.hint') }}</p>
    <label class="field">
      <span>{{ t('viewer.code') }}</span>
      <input v-model="code" class="pin-input" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" required />
    </label>
    <button type="submit" class="button big" :disabled="busy || !code.trim()">{{ t('viewer.open') }}</button>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </form>
</template>
