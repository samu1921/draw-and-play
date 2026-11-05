<script setup lang="ts">
import { SPORT_IDS } from '@draw-and-play/domain';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api, type EventInfo } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';
import { useSessionStore } from '../../stores/session.js';

const { t, te, d } = useI18n();
const router = useRouter();
const session = useSessionStore();
const events = ref<EventInfo[] | null>(null);
const form = ref({ name: '', slug: '', startsOn: '', tableCount: 4, sport: SPORT_IDS[0] as string });
const error = ref('');
const importError = ref('');
const importing = ref(false);

onMounted(async () => {
  events.value = (await api<{ events: EventInfo[] }>('GET', '/api/events')).events;
});

async function create() {
  error.value = '';
  try {
    const { event } = await api<{ event: EventInfo }>('POST', '/api/events', {
      name: form.value.name,
      tableCount: form.value.tableCount,
      sport: form.value.sport,
      ...(form.value.slug && { slug: form.value.slug }),
      ...(form.value.startsOn && { startsOn: form.value.startsOn }),
    });
    await router.push(`/admin/events/${event.id}`);
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}

async function importFile(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file) return;
  importError.value = '';
  importing.value = true;
  try {
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      importError.value = t('errors.notJson');
      return;
    }
    const { event } = await api<{ event: EventInfo }>('POST', '/api/events/import', doc, { timeoutMs: 120_000 });
    await router.push(`/admin/events/${event.id}`);
  } catch (e) {
    importError.value = errorText(t, te, e);
  } finally {
    importing.value = false;
    input.value = '';
  }
}
</script>

<template>
  <div class="page">
    <h1>{{ t('admin.events.title') }}</h1>
    <section class="card">
      <p v-if="events && events.length === 0" class="muted">{{ t('admin.events.empty') }}</p>
      <ul v-else class="link-list">
        <li v-for="e in events ?? []" :key="e.id">
          <RouterLink :to="`/admin/events/${e.id}`">{{ e.name }}</RouterLink>
          <span class="muted"> · {{ t(`sports.${e.sport}`) }}</span>
          <span v-if="e.startsOn" class="muted"> · {{ d(new Date(e.startsOn)) }}</span>
        </li>
      </ul>
    </section>

    <section v-if="session.isAdmin" class="card" aria-labelledby="create-event">
      <h2 id="create-event">{{ t('admin.events.create') }}</h2>
      <form class="fields" @submit.prevent="create">
        <label class="field wide">
          <span>{{ t('admin.events.name') }}</span>
          <input v-model="form.name" type="text" required maxlength="120" />
        </label>
        <label class="field">
          <span>{{ t('admin.events.slug') }} ({{ t('common.optional') }})</span>
          <input v-model="form.slug" type="text" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="60" placeholder="vm-2026" />
        </label>
        <label class="field">
          <span>{{ t('admin.events.startsOn') }}</span>
          <input v-model="form.startsOn" type="date" />
        </label>
        <!-- Only worth asking once there is more than one sport -->
        <label v-if="SPORT_IDS.length > 1" class="field">
          <span>{{ t('admin.events.sport') }}</span>
          <select v-model="form.sport">
            <option v-for="id in SPORT_IDS" :key="id" :value="id">{{ t(`sports.${id}`) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('admin.events.tableCount') }}</span>
          <input v-model.number="form.tableCount" type="number" min="1" max="64" required />
        </label>
        <div class="field form-actions">
          <button type="submit" class="button">{{ t('admin.events.create') }}</button>
        </div>
        <p v-if="error" class="warning-text wide" role="alert">{{ error }}</p>
      </form>
    </section>

    <section v-if="session.isAdmin" class="card" aria-labelledby="import-event">
      <h2 id="import-event">{{ t('admin.events.import') }}</h2>
      <p class="muted">{{ t('admin.events.importHint') }}</p>
      <label class="field">
        <span>{{ t('admin.events.importFile') }}</span>
        <input type="file" accept=".json,application/json" :disabled="importing" @change="importFile($event.target as HTMLInputElement)" />
      </label>
      <p v-if="importError" class="warning-text" role="alert">{{ importError }}</p>
    </section>
  </div>
</template>
