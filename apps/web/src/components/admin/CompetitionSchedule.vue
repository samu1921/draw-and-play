<script setup lang="ts">
import { Clock } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type CompetitionInfo } from '../../lib/api.js';
import { dayDate, eventDays } from '../../lib/days.js';
import { errorText } from '../../lib/messages.js';
import { formatClock, parseClock } from '../../lib/time.js';

/**
 * When and where a competition is played: its day (multi-day events), earliest start, the competition it follows,
 * minutes per match and the tables it may use. All of it feeds the forecast and can change at any time.
 */
const props = defineProps<{ competition: CompetitionInfo }>();
const emit = defineEmits<{ saved: [] }>();
const { t, te, d } = useI18n();
const live = injectLiveEvent();
const overview = computed(() => live.overview.value!);

interface Form {
  day: string;
  earliestStart: string;
  startAfterId: string;
  matchMinutes: number | '';
  /** Empty = all tables */
  tableIds: string[];
}
const form = ref<Form>({ day: '', earliestStart: '', startAfterId: '', matchMinutes: 20, tableIds: [] });
// Watched by value: live reloads bring new objects with the same content and must not wipe what is being typed
watch(
  () => {
    const c = props.competition;
    return JSON.stringify([c.day ?? '', c.earliestStart, c.startAfterId ?? '', c.matchMinutes, c.tableIds ?? []]);
  },
  (saved) => {
    const [day, earliestStart, startAfterId, matchMinutes, tableIds] = JSON.parse(saved) as [string, number | null, string, number, string[]];
    form.value = { day, earliestStart: earliestStart === null ? '' : formatClock(earliestStart), startAfterId, matchMinutes, tableIds };
  },
  { immediate: true },
);

/** The event's days, plus a day the competition still has from before the event's days changed */
const days = computed(() => {
  const list = eventDays(overview.value.event.startsOn, overview.value.event.endsOn);
  const own = props.competition.day;
  return own && !list.includes(own) ? [...list, own].sort() : list;
});
const multiDay = computed(() => days.value.length > 1);
const dayLabel = (iso: string) => d(dayDate(iso), { weekday: 'long', day: 'numeric', month: 'long' });

/** Only competitions on the same day can come before this one */
const predecessors = computed(() =>
  overview.value.competitions.filter((c) => c.id !== props.competition.id && (c.day ?? '') === form.value.day),
);
watch(predecessors, (list) => {
  if (form.value.startAfterId && !list.some((c) => c.id === form.value.startAfterId)) form.value.startAfterId = '';
});

const allTables = computed(() => form.value.tableIds.length === 0);
function toggleAll(checked: boolean) {
  form.value.tableIds = checked ? [] : overview.value.tables.map((table) => table.id);
}

const error = ref('');
const message = ref('');
async function save() {
  error.value = '';
  message.value = '';
  const earliestStart = form.value.earliestStart ? parseClock(form.value.earliestStart) : null;
  try {
    await api('PATCH', `/api/competitions/${props.competition.id}`, {
      version: props.competition.version,
      day: form.value.day || null,
      earliestStart,
      startAfterId: form.value.startAfterId || null,
      ...(form.value.matchMinutes !== '' && { matchMinutes: form.value.matchMinutes }),
      tableIds: form.value.tableIds.length > 0 ? form.value.tableIds : null,
    });
    message.value = t('admin.setup.saved');
    await live.reload();
    emit('saved');
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
</script>

<template>
  <section class="card" aria-labelledby="schedule-title">
    <h3 id="schedule-title"><Clock aria-hidden="true" />{{ t('admin.schedule.title') }}</h3>
    <form class="fields" @submit.prevent="save">
      <label v-if="multiDay" class="field">
        <span>{{ t('admin.schedule.day') }}</span>
        <select v-model="form.day">
          <option value="">{{ t('admin.schedule.noDay') }}</option>
          <option v-for="day in days" :key="day" :value="day">{{ dayLabel(day) }}</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('admin.schedule.earliestStart') }} ({{ t('common.optional') }})</span>
        <input v-model="form.earliestStart" type="time" />
      </label>
      <label class="field">
        <span>{{ t('admin.schedule.startAfter') }}</span>
        <select v-model="form.startAfterId">
          <option value="">—</option>
          <option v-for="c in predecessors" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('admin.schedule.matchMinutes') }}</span>
        <input v-model.number="form.matchMinutes" type="number" min="5" max="240" inputmode="numeric" required />
      </label>
      <fieldset class="field wide plain-fieldset">
        <legend>{{ t('admin.schedule.tables') }}</legend>
        <label class="check">
          <input type="checkbox" :checked="allTables" @change="toggleAll(($event.target as HTMLInputElement).checked)" />
          {{ t('admin.schedule.allTables') }}
        </label>
        <div v-if="!allTables" class="check-grid">
          <label v-for="table in overview.tables" :key="table.id" class="check">
            <input v-model="form.tableIds" type="checkbox" :value="table.id" />
            {{ t('print.sheet.table', { name: table.name }) }}
          </label>
        </div>
      </fieldset>
      <p class="muted small wide">{{ t('admin.schedule.hint') }}</p>
      <div class="field form-actions">
        <button type="submit" class="button" :disabled="!allTables && form.tableIds.length === 0">{{ t('common.save') }}</button>
      </div>
      <p v-if="message" class="muted wide" role="status">{{ message }}</p>
      <p v-if="error" class="warning-text wide" role="alert">{{ error }}</p>
    </form>
  </section>
</template>
