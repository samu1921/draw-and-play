<script setup lang="ts">
import { CalendarDays, DatabaseBackup, Palette, Globe, KeyRound, Scale, Smartphone, Table2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLegalDefaults } from '../../composables/useLegal.js';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api } from '../../lib/api.js';
import BrandingEditor from '../../components/admin/BrandingEditor.vue';
import { installationBranding, loadConfig, type Branding } from '../../lib/branding.js';
import { eventDays } from '../../lib/days.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const live = injectLiveEvent();
const event = computed(() => live.overview.value!.event);

// --- Name and days of the event ---
const eventForm = ref({ name: '', startsOn: '', endsOn: '' });
watch(
  () => JSON.stringify([event.value.name, event.value.startsOn ?? '', event.value.endsOn ?? '']),
  (saved) => {
    const [name, startsOn, endsOn] = JSON.parse(saved) as [string, string, string];
    eventForm.value = { name, startsOn, endsOn };
  },
  { immediate: true },
);
/** Competitions planned on a day the event no longer covers */
const strayCompetitions = computed(() => {
  const days = eventDays(eventForm.value.startsOn || null, eventForm.value.endsOn || null);
  return (live.overview.value?.competitions ?? []).filter((c) => c.day && !days.includes(c.day)).map((c) => c.name);
});
const saveEvent = () =>
  run(() =>
    api('PATCH', `/api/events/${event.value.id}`, {
      name: eventForm.value.name,
      startsOn: eventForm.value.startsOn || null,
      endsOn: (eventForm.value.startsOn && eventForm.value.endsOn) || null,
    }),
  );

// --- The event's own look on top of the installation's ---
void loadConfig();
const brandingOpen = ref(false);
const brandingDraft = ref<Branding>({});
watch(
  () => JSON.stringify(event.value.settings.branding ?? {}),
  (saved) => (brandingDraft.value = JSON.parse(saved) as Branding),
  { immediate: true },
);
const hasOwnBranding = computed(() => Object.values(event.value.settings.branding ?? {}).some((v) => v !== null && v !== undefined && v !== ''));
const saveBranding = (value: Branding) => run(() => api('PATCH', `/api/events/${event.value.id}`, { settings: { branding: value } }));

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
    <section class="card" aria-labelledby="event-title">
      <h2 id="event-title"><CalendarDays aria-hidden="true" />{{ t('admin.setup.eventTitle') }}</h2>
      <form class="fields" @submit.prevent="saveEvent">
        <label class="field wide">
          <span>{{ t('admin.events.name') }}</span>
          <input v-model="eventForm.name" type="text" required maxlength="120" />
        </label>
        <label class="field">
          <span>{{ t('admin.events.startsOn') }}</span>
          <input v-model="eventForm.startsOn" type="date" />
        </label>
        <label class="field">
          <span>{{ t('admin.events.endsOn') }}</span>
          <input v-model="eventForm.endsOn" type="date" :min="eventForm.startsOn || undefined" :disabled="!eventForm.startsOn" />
        </label>
        <p class="muted small wide">{{ t('admin.setup.daysHint') }}</p>
        <p v-if="strayCompetitions.length > 0" class="warning-text wide">{{ t('admin.setup.strayDays', { names: strayCompetitions.join(', ') }) }}</p>
        <div class="field form-actions"><button type="submit" class="button">{{ t('common.save') }}</button></div>
      </form>
    </section>

    <section class="card" aria-labelledby="tables-title">
      <h2 id="tables-title"><Table2 aria-hidden="true" />{{ t('admin.setup.tables') }}</h2>
      <label class="field">
        <span>{{ t('admin.setup.tableNamesHint') }}</span>
        <textarea v-model="tableNames" rows="8"></textarea>
      </label>
      <div><button type="button" class="button" @click="saveTables">{{ t('admin.setup.saveTables') }}</button></div>
    </section>

    <section class="card" aria-labelledby="pin-title">
      <h2 id="pin-title"><Smartphone aria-hidden="true" />{{ t('admin.setup.pinTitle') }}</h2>
      <p>{{ event.pinEnabled ? t('admin.setup.pinOn') : t('admin.setup.pinOff') }}</p>
      <p v-if="pin" class="pin-display" role="status">{{ t('admin.setup.pinShown', { pin }) }}</p>
      <div class="button-row">
        <button type="button" class="button" @click="newPin">{{ t('admin.setup.newPin') }}</button>
        <button v-if="event.pinEnabled" type="button" class="button secondary" @click="disablePin">{{ t('admin.setup.disablePin') }}</button>
      </div>
      <RouterLink :to="`/admin/events/${event.id}/qr`" target="_blank">{{ t('admin.setup.qr') }}</RouterLink>
    </section>

    <section class="card" aria-labelledby="links-title">
      <h2 id="links-title"><Globe aria-hidden="true" />{{ t('admin.setup.links') }}</h2>
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
      <h2 id="viewer-title"><KeyRound aria-hidden="true" />{{ t('admin.setup.viewerTitle') }}</h2>
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
      <h2 id="legal-title"><Scale aria-hidden="true" />{{ t('admin.setup.legalTitle') }}</h2>
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

    <section class="card wide-card" aria-labelledby="branding-title">
      <div class="card-header">
        <h2 id="branding-title"><Palette aria-hidden="true" />{{ t('branding.eventTitle') }}</h2>
        <button type="button" class="button secondary small" :aria-expanded="brandingOpen" @click="brandingOpen = !brandingOpen">
          {{ brandingOpen ? t('common.close') : t('branding.customize') }}
        </button>
      </div>
      <p class="muted small">{{ hasOwnBranding ? t('branding.eventOwn') : t('branding.eventInherits') }}</p>
      <template v-if="brandingOpen">
        <BrandingEditor v-model="brandingDraft" :event-id="event.id" :inherited="installationBranding" />
        <div class="button-row">
          <button type="button" class="button" @click="saveBranding(brandingDraft)">{{ t('common.save') }}</button>
          <button v-if="hasOwnBranding" type="button" class="button secondary" @click="saveBranding({})">{{ t('branding.resetEvent') }}</button>
        </div>
      </template>
    </section>

    <section class="card" aria-labelledby="backup-title">
      <h2 id="backup-title"><DatabaseBackup aria-hidden="true" />{{ t('admin.setup.backupTitle') }}</h2>
      <p class="muted">{{ t('admin.setup.backupHint') }}</p>
      <div><a class="button secondary" :href="`/api/events/${event.id}/export`" download>{{ t('admin.setup.export') }}</a></div>
    </section>

    <p v-if="message" class="muted" role="status">{{ message }}</p>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </div>
</template>
