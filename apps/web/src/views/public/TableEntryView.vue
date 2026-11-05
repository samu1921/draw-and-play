<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import ResultKeypad from '../../components/live/ResultKeypad.vue';
import StreamBadge from '../../components/live/StreamBadge.vue';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { api, ApiRequestError } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const route = useRoute();
const slug = computed(() => route.params.slug as string);
const tableName = computed(() => route.params.table as string);
const live = useLiveEvent(slug, { operations: true });

const signedIn = ref<boolean | null>(null);
const pin = ref('');
const notation = ref('');
const error = ref('');
const busy = ref(false);
const savedMatchId = ref<string | null>(null);

const table = computed(() => live.operations.value?.tables.find((t) => t.name === tableName.value));
const match = computed(() => table.value?.match ?? null);
const competition = computed(() => live.overview.value?.competitions.find((c) => c.id === match.value?.competitionId));
const names = computed<[string, string]>(() => [match.value?.sides[0]?.name ?? '', match.value?.sides[1]?.name ?? '']);
const complete = computed(() => {
  if (!competition.value || !notation.value.trim()) return false;
  const parsed = live.sport.value.parseResult(notation.value, competition.value.matchRules);
  return parsed.ok && parsed.outcome.status === 'finished';
});

// A new match at this table starts with an empty form.
watch(
  () => match.value?.id,
  (id) => {
    if (id && id !== savedMatchId.value) {
      notation.value = '';
      savedMatchId.value = null;
    }
  },
);

onMounted(async () => {
  try {
    const { device } = await api<{ device: unknown }>('GET', `/api/events/${encodeURIComponent(slug.value)}/device`);
    signedIn.value = device !== null;
  } catch (e) {
    error.value = errorText(t, te, e);
  }
});

async function signIn() {
  busy.value = true;
  error.value = '';
  try {
    await api('POST', `/api/events/${encodeURIComponent(slug.value)}/device`, { pin: pin.value, label: t('table.title', { name: tableName.value }) });
    signedIn.value = true;
    pin.value = '';
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (!match.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api('POST', `/api/matches/${match.value.id}/result`, { notation: notation.value, version: match.value.version });
    savedMatchId.value = match.value.id;
  } catch (e) {
    error.value = errorText(t, te, e);
    if (e instanceof ApiRequestError && e.status === 401) signedIn.value = false;
  } finally {
    busy.value = false;
    await live.reload();
  }
}
</script>

<template>
  <div class="phone">
    <header class="phone-head">
      <div>
        <p class="muted small">{{ live.overview.value?.event.name }}</p>
        <h1>{{ t('table.title', { name: tableName }) }}</h1>
      </div>
      <StreamBadge :status="live.status.value" />
    </header>

    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>

    <template v-if="live.overview.value && signedIn !== null">
      <p v-if="!live.overview.value.event.pinEnabled" class="card">{{ t('table.pinOff') }}</p>

      <form v-else-if="!signedIn" class="card stack" @submit.prevent="signIn">
        <h2>{{ t('table.pinTitle') }}</h2>
        <p class="muted">{{ t('table.pinHint') }}</p>
        <label class="field">
          <span>{{ t('table.pin') }}</span>
          <input v-model="pin" class="pin-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="\d{6}" maxlength="6" required />
        </label>
        <button type="submit" class="button big" :disabled="busy || pin.length !== 6">{{ t('table.signIn') }}</button>
      </form>

      <p v-else-if="live.operations.value && !table" class="card">{{ t('table.unknownTable') }}</p>

      <div v-else-if="savedMatchId && (!match || match.id === savedMatchId)" class="card success" role="status">
        ✓ {{ t('table.saved') }}
      </div>

      <form v-else-if="match && competition" class="card stack" @submit.prevent="submit">
        <p class="muted">{{ competition.name }} · {{ matchLabel(t, match) }}</p>
        <div class="phone-players">
          <span>{{ names[0] }}</span>
          <span class="muted">{{ t('public.vs') }}</span>
          <span>{{ names[1] }}</span>
        </div>
        <ResultKeypad v-model="notation" :rules="competition.matchRules" :sport="live.sport.value" :sides="names" keypad />
        <button type="submit" class="button big" :disabled="!complete || busy">{{ t('result.submit') }}</button>
      </form>

      <div v-else class="card">
        <p>{{ t('table.noMatch') }}</p>
        <p class="muted small">{{ t('table.autoUpdate') }}</p>
      </div>
    </template>
    <p v-else class="muted">{{ t('common.loading') }}</p>
  </div>
</template>
