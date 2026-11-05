<script setup lang="ts">
import { SPORT_IDS } from '@draw-and-play/domain';
import { CalendarDays, ChevronRight, Play, Plus, Upload, X } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api, type EventInfo } from '../../lib/api.js';
import { dayDate } from '../../lib/days.js';
import { errorText } from '../../lib/messages.js';
import { useSessionStore } from '../../stores/session.js';

const { t, te, d } = useI18n();
const router = useRouter();
const session = useSessionStore();
const events = ref<EventInfo[] | null>(null);
const form = ref({ name: '', slug: '', startsOn: '', endsOn: '', tableCount: 4, sport: SPORT_IDS[0] as string });
const error = ref('');
const importError = ref('');
const importing = ref(false);
/** The create and import forms open on demand, so the list of events stays the first thing on the page */
const creating = ref(false);

/** Calendar day in local time, so an event "today" does not jump with the time zone */
const today = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();
type When = 'today' | 'upcoming' | 'past' | 'undated';
const whenOf = (e: EventInfo): When => {
  if (!e.startsOn) return 'undated';
  const end = e.endsOn ?? e.startsOn;
  if (e.startsOn <= today && today <= end) return 'today';
  return e.startsOn > today ? 'upcoming' : 'past';
};
const ORDER: Record<When, number> = { today: 0, upcoming: 1, undated: 2, past: 3 };
/** Running events first, then the coming ones (nearest first), events without a date, and past ones (latest first) */
const sorted = computed(() =>
  [...(events.value ?? [])]
    .map((event) => ({ event, when: whenOf(event) }))
    .sort((a, b) => {
      if (a.when !== b.when) return ORDER[a.when] - ORDER[b.when];
      const byDate = (a.event.startsOn ?? '').localeCompare(b.event.startsOn ?? '');
      return a.when === 'past' ? -byDate : byDate || a.event.name.localeCompare(b.event.name);
    }),
);
/** "Friday, 6 November 2026" or "Fri, 6 November – Sun, 8 November 2026" */
const dateRange = (e: EventInfo) => {
  if (!e.startsOn) return '';
  if (!e.endsOn || e.endsOn === e.startsOn) return d(dayDate(e.startsOn), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${d(dayDate(e.startsOn), { weekday: 'short', day: 'numeric', month: 'long' })} – ${d(dayDate(e.endsOn), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}`;
};
const dateParts = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  return { day: d(date, { day: 'numeric' }), month: d(date, { month: 'short' }) };
};

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
      ...(form.value.startsOn && form.value.endsOn && { endsOn: form.value.endsOn }),
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
    <header class="page-title">
      <h1>{{ t('admin.events.title') }}</h1>
      <button v-if="session.isAdmin" type="button" class="button" :aria-expanded="creating" @click="creating = !creating">
        <component :is="creating ? X : Plus" aria-hidden="true" />
        {{ creating ? t('common.close') : t('admin.events.new') }}
      </button>
    </header>

    <div v-if="creating && session.isAdmin" class="setup-grid">
      <section class="card" aria-labelledby="create-event">
        <h2 id="create-event"><Plus aria-hidden="true" />{{ t('admin.events.create') }}</h2>
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
          <label class="field">
            <span>{{ t('admin.events.endsOn') }} ({{ t('common.optional') }})</span>
            <input v-model="form.endsOn" type="date" :min="form.startsOn || undefined" :disabled="!form.startsOn" />
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

      <section class="card" aria-labelledby="import-event">
        <h2 id="import-event"><Upload aria-hidden="true" />{{ t('admin.events.import') }}</h2>
        <p class="muted">{{ t('admin.events.importHint') }}</p>
        <label class="field">
          <span>{{ t('admin.events.importFile') }}</span>
          <input type="file" accept=".json,application/json" :disabled="importing" @change="importFile($event.target as HTMLInputElement)" />
        </label>
        <p v-if="importError" class="warning-text" role="alert">{{ importError }}</p>
      </section>
    </div>

    <p v-if="events === null" class="muted">{{ t('common.loading') }}</p>
    <section v-else-if="events.length === 0" class="card empty-state">
      <CalendarDays class="empty-icon" aria-hidden="true" />
      <p>{{ t('admin.events.empty') }}</p>
      <button v-if="session.isAdmin && !creating" type="button" class="button" @click="creating = true">
        <Plus aria-hidden="true" />{{ t('admin.events.new') }}
      </button>
    </section>
    <ul v-else class="event-cards">
      <li v-for="{ event: e, when } in sorted" :key="e.id" class="event-card" :class="when">
        <div class="event-date" aria-hidden="true">
          <template v-if="e.startsOn">
            <span class="event-date-day">{{ dateParts(e.startsOn).day }}</span>
            <span class="event-date-month">{{ dateParts(e.startsOn).month }}</span>
          </template>
          <CalendarDays v-else />
        </div>
        <div class="event-card-body">
          <RouterLink :to="`/admin/events/${e.id}`" class="event-card-link">{{ e.name }}</RouterLink>
          <p class="muted small">
            {{ t(`sports.${e.sport}`) }}
            <template v-if="e.startsOn"> · {{ dateRange(e) }}</template>
          </p>
          <span v-if="when === 'today'" class="badge">{{ t('admin.events.today') }}</span>
        </div>
        <RouterLink v-if="when === 'today' && session.isAdmin" :to="`/admin/events/${e.id}/desk`" class="button small event-card-action">
          <Play aria-hidden="true" />{{ t('admin.tabs.desk') }}
        </RouterLink>
        <ChevronRight v-else class="event-card-chevron" aria-hidden="true" />
      </li>
    </ul>
  </div>
</template>
