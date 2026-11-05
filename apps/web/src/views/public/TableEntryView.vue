<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import OutboxNotice from '../../components/live/OutboxNotice.vue';
import ResultKeypad from '../../components/live/ResultKeypad.vue';
import StreamBadge from '../../components/live/StreamBadge.vue';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { useResultOutbox } from '../../composables/useResultOutbox.js';
import { api, ApiRequestError } from '../../lib/api.js';
import { matchLabel } from '../../lib/describe.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const route = useRoute();
const slug = computed(() => route.params.slug as string);
const tableName = computed(() => route.params.table as string);
const live = useLiveEvent(slug, { operations: true, remember: true });
const outbox = useResultOutbox(
  computed(() => live.overview.value?.event.id),
  live.status,
  { device: true },
);

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
/** Known from the overview, or from the refusal while the public views need the viewer code */
const eventName = computed(() => live.overview.value?.event.name ?? live.locked.value?.name ?? '');
const pinEnabled = computed(() => live.overview.value?.event.pinEnabled ?? live.locked.value?.pinEnabled ?? false);
/** The saved result of this table still waits on the phone */
const savedQueued = computed(() => outbox.waiting.value.some((i) => i.matchId === savedMatchId.value));
/** Waiting results of other matches (e.g. from before a reload) are listed separately */
const otherWaiting = computed(() => outbox.waiting.value.filter((i) => i.matchId !== savedMatchId.value));

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

// Remembered per event, so a page reloaded without a connection still knows this phone was signed in.
const signedInKey = computed(() => `dap-device:${slug.value}`);
function rememberSignIn(value: boolean) {
  try {
    if (value) localStorage.setItem(signedInKey.value, '1');
    else localStorage.removeItem(signedInKey.value);
  } catch {
    // Without storage the phone asks again after an offline reload
  }
}
function rememberedSignIn(): boolean {
  try {
    return localStorage.getItem(signedInKey.value) === '1';
  } catch {
    return false;
  }
}

async function checkDevice() {
  try {
    const { device } = await api<{ device: unknown }>('GET', `/api/events/${encodeURIComponent(slug.value)}/device`);
    signedIn.value = device !== null;
    rememberSignIn(signedIn.value);
    error.value = '';
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 0 && rememberedSignIn()) signedIn.value = true;
    else error.value = errorText(t, te, e);
  }
}
onMounted(checkDevice);
// Checked again once the connection is back, in case the first check failed offline.
watch(live.status, (status) => {
  if (status === 'live' && (signedIn.value === null || error.value)) void checkDevice();
});
// The PIN changed while a result was waiting: ask for the new one, the result goes out afterwards.
watch(outbox.needsSignIn, (needed) => {
  if (needed) {
    signedIn.value = false;
    rememberSignIn(false);
  }
});

async function signIn() {
  busy.value = true;
  error.value = '';
  try {
    await api('POST', `/api/events/${encodeURIComponent(slug.value)}/device`, { pin: pin.value, label: t('table.title', { name: tableName.value }) });
    signedIn.value = true;
    rememberSignIn(true);
    pin.value = '';
    // A signed-in device may read the event even when the public views need the viewer code
    if (live.locked.value) await live.reconnect();
    await outbox.flush();
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (!match.value || !competition.value) return;
  busy.value = true;
  error.value = '';
  const current = match.value;
  try {
    await outbox.submit({
      matchId: current.id,
      version: current.version,
      body: { notation: notation.value },
      label: `${competition.value.name} · ${matchLabel(t, current)}: ${names.value[0]} – ${names.value[1]}`,
    });
    savedMatchId.value = current.id;
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
    void live.reload();
  }
}
</script>

<template>
  <div class="phone">
    <header class="phone-head">
      <div>
        <p class="muted small">{{ eventName }}</p>
        <h1>{{ t('table.title', { name: tableName }) }}</h1>
      </div>
      <StreamBadge v-if="!live.locked.value" :status="live.status.value" />
    </header>

    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    <OutboxNotice :waiting="otherWaiting" :refused="outbox.refused.value" @dismiss="outbox.dismiss" />

    <template v-if="(live.overview.value || live.locked.value) && signedIn !== null">
      <p v-if="!pinEnabled" class="card">{{ t('table.pinOff') }}</p>

      <form v-else-if="!signedIn" class="card stack" @submit.prevent="signIn">
        <h2>{{ t('table.pinTitle') }}</h2>
        <p v-if="outbox.waiting.value.length > 0" class="warning-text">{{ t('table.signInAgain') }}</p>
        <p class="muted">{{ t('table.pinHint') }}</p>
        <label class="field">
          <span>{{ t('table.pin') }}</span>
          <input v-model="pin" class="pin-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="\d{6}" maxlength="6" required />
        </label>
        <button type="submit" class="button big" :disabled="busy || pin.length !== 6">{{ t('table.signIn') }}</button>
      </form>

      <p v-else-if="live.operations.value && !table" class="card">{{ t('table.unknownTable') }}</p>

      <div v-else-if="savedMatchId && savedQueued" class="card notice" role="status">
        <p class="success">{{ t('table.queuedTitle') }}</p>
        <p>{{ t('table.queued') }}</p>
      </div>

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
