<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLegalDefaults } from '../../composables/useLegal.js';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const live = injectLiveEvent();
const event = computed(() => live.overview.value!.event);

const tableNames = ref('');
// Watched by value: live reloads bring new objects with the same content and must not wipe what is being typed
watch(
  () => (live.overview.value?.tables ?? []).map((t) => t.name).join('\n'),
  (names) => (tableNames.value = names),
  { immediate: true },
);

const message = ref('');
const error = ref('');
const pin = ref<string | null>(null);

async function run(action: () => Promise<unknown>, success = t('admin.setup.saved')) {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
    await live.reload();
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}

const saveTables = () =>
  run(() =>
    api('PUT', `/api/events/${event.value.id}/tables`, {
      names: tableNames.value
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean),
    }),
  );

const newPin = () =>
  run(async () => {
    pin.value = (await api<{ pin: string }>('POST', `/api/events/${event.value.id}/pin`)).pin;
  }, '');
const disablePin = () =>
  run(async () => {
    pin.value = null;
    await api('DELETE', `/api/events/${event.value.id}/pin`);
  });

// --- Viewer code for the public views ---
const viewerCode = computed(() => event.value.viewerCode ?? null);
/** Public link that opens the views right away (also for the projector) */
const publicLink = computed(() => `/e/${event.value.slug}${viewerCode.value ? `?code=${viewerCode.value}` : ''}`);
const newViewerCode = () => {
  if (viewerCode.value && !confirm(t('admin.setup.viewerRotateConfirm'))) return;
  void run(() => api('POST', `/api/events/${event.value.id}/viewer-code`));
};
const openViews = () => {
  if (confirm(t('admin.setup.viewerOpenConfirm'))) void run(() => api('DELETE', `/api/events/${event.value.id}/viewer-code`));
};

// --- Legal notice and privacy policy of this event ---
const legalDefaults = useLegalDefaults();
const legalForm = ref({ imprintUrl: '', privacyUrl: '', privacyNote: '' });
watch(
  () => {
    const s = event.value.settings;
    return JSON.stringify([s.imprintUrl ?? '', s.privacyUrl ?? '', s.privacyNote ?? '']);
  },
  (saved) => {
    const [imprintUrl, privacyUrl, privacyNote] = JSON.parse(saved) as [string, string, string];
    legalForm.value = { imprintUrl, privacyUrl, privacyNote };
  },
  { immediate: true },
);
const saveLegal = () => run(() => api('PATCH', `/api/events/${event.value.id}`, { settings: legalForm.value }));

const setSetting = (key: 'shortNames' | 'publicRatings', value: boolean) =>
  run(() => api('PATCH', `/api/events/${event.value.id}`, { settings: { [key]: value } }));
</script>

<template>
  <div class="setup-grid">
    <section class="card" aria-labelledby="tables-title">
      <h2 id="tables-title">{{ t('admin.setup.tables') }}</h2>
      <label class="field">
        <span>{{ t('admin.setup.tableNamesHint') }}</span>
        <textarea v-model="tableNames" rows="8"></textarea>
      </label>
      <div><button type="button" class="button" @click="saveTables">{{ t('admin.setup.saveTables') }}</button></div>
    </section>

    <section class="card" aria-labelledby="pin-title">
      <h2 id="pin-title">{{ t('admin.setup.pinTitle') }}</h2>
      <p>{{ event.pinEnabled ? t('admin.setup.pinOn') : t('admin.setup.pinOff') }}</p>
      <p v-if="pin" class="pin-display" role="status">{{ t('admin.setup.pinShown', { pin }) }}</p>
      <div class="button-row">
        <button type="button" class="button" @click="newPin">{{ t('admin.setup.newPin') }}</button>
        <button v-if="event.pinEnabled" type="button" class="button secondary" @click="disablePin">{{ t('admin.setup.disablePin') }}</button>
      </div>
      <RouterLink :to="`/admin/events/${event.id}/qr`" target="_blank">{{ t('admin.setup.qr') }}</RouterLink>
    </section>

    <section class="card" aria-labelledby="links-title">
      <h2 id="links-title">{{ t('admin.setup.links') }}</h2>
      <ul class="link-list">
        <li><RouterLink :to="publicLink" target="_blank">{{ t('admin.setup.publicView') }}</RouterLink></li>
        <li><RouterLink :to="`/admin/events/${event.id}/displays`">{{ t('admin.setup.display') }}</RouterLink></li>
      </ul>
      <label class="check">
        <input type="checkbox" :checked="event.settings.shortNames ?? false" @change="setSetting('shortNames', ($event.target as HTMLInputElement).checked)" />
        {{ t('admin.setup.shortNames') }}
      </label>
      <label class="check">
        <input
          type="checkbox"
          :checked="event.settings.publicRatings ?? false"
          @change="setSetting('publicRatings', ($event.target as HTMLInputElement).checked)"
        />
        {{ t('admin.setup.publicRatings') }}
      </label>
    </section>

    <section class="card" aria-labelledby="viewer-title">
      <h2 id="viewer-title">{{ t('admin.setup.viewerTitle') }}</h2>
      <template v-if="viewerCode">
        <p>{{ t('admin.setup.viewerOn') }}</p>
        <p class="pin-display viewer-code">{{ viewerCode }}</p>
        <p class="muted small">{{ t('admin.setup.viewerHint') }}</p>
      </template>
      <p v-else>{{ t('admin.setup.viewerOff') }}</p>
      <div class="button-row">
        <button type="button" class="button" @click="newViewerCode">{{ viewerCode ? t('admin.setup.viewerRotate') : t('admin.setup.viewerProtect') }}</button>
        <button v-if="viewerCode" type="button" class="button secondary" @click="openViews">{{ t('admin.setup.viewerOpen') }}</button>
      </div>
      <RouterLink v-if="viewerCode" :to="`/admin/events/${event.id}/viewer-notice`" target="_blank">{{ t('admin.setup.viewerNotice') }}</RouterLink>
    </section>

    <section class="card" aria-labelledby="legal-title">
      <h2 id="legal-title">{{ t('admin.setup.legalTitle') }}</h2>
      <p class="muted small">{{ t('admin.setup.legalHint') }}</p>
      <form class="stack" @submit.prevent="saveLegal">
        <label class="field">
          <span>{{ t('legal.imprint') }} (URL)</span>
          <input v-model.trim="legalForm.imprintUrl" type="url" maxlength="500" :placeholder="legalDefaults.imprintUrl ?? 'https://…'" />
        </label>
        <label class="field">
          <span>{{ t('legal.privacy') }} (URL)</span>
          <input v-model.trim="legalForm.privacyUrl" type="url" maxlength="500" :placeholder="legalDefaults.privacyUrl ?? 'https://…'" />
        </label>
        <label class="field">
          <span>{{ t('admin.setup.privacyNote') }}</span>
          <textarea v-model="legalForm.privacyNote" rows="3" maxlength="1000" :placeholder="t('admin.setup.privacyNoteExample')"></textarea>
        </label>
        <div><button type="submit" class="button">{{ t('admin.setup.saveLegal') }}</button></div>
      </form>
    </section>

    <section class="card" aria-labelledby="backup-title">
      <h2 id="backup-title">{{ t('admin.setup.backupTitle') }}</h2>
      <p class="muted">{{ t('admin.setup.backupHint') }}</p>
      <div><a class="button secondary" :href="`/api/events/${event.id}/export`" download>{{ t('admin.setup.export') }}</a></div>
    </section>

    <p v-if="message" class="muted" role="status">{{ message }}</p>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </div>
</template>
