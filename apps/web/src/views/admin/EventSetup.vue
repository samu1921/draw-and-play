<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const live = injectLiveEvent();
const event = computed(() => live.overview.value!.event);

const tableNames = ref('');
watch(
  () => live.overview.value?.tables,
  (tables) => (tableNames.value = (tables ?? []).map((t) => t.name).join('\n')),
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
        <li><RouterLink :to="`/e/${event.slug}`" target="_blank">{{ t('admin.setup.publicView') }}</RouterLink></li>
        <li><RouterLink :to="`/e/${event.slug}/display`" target="_blank">{{ t('admin.setup.display') }}</RouterLink></li>
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

    <p v-if="message" class="muted" role="status">{{ message }}</p>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </div>
</template>
