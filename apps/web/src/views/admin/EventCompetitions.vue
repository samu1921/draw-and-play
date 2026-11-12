<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { generateVariants } from '@draw-and-play/domain';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type CompetitionInfo, type CompetitionKind } from '../../lib/api.js';
import { dayDate, eventDays } from '../../lib/days.js';
import FormatSettingsFields from '../../components/FormatSettingsFields.vue';
import { describeFormat } from '../../lib/describe.js';
import { defaultFormatForm, formatSettings } from '../../lib/formatForm.js';
import { errorText } from '../../lib/messages.js';
import { useSessionStore } from '../../stores/session.js';

const { t, te, d } = useI18n();
const router = useRouter();
const live = injectLiveEvent();
const session = useSessionStore();
const overview = computed(() => live.overview.value!);

const form = ref({ name: '', kind: 'singles' as CompetitionKind, gamesToWin: 3, expected: 8, variantId: '', day: '' });
const settings = ref(defaultFormatForm());
/** Days of a multi-day event; a new competition starts on the first one */
const days = computed(() => eventDays(overview.value.event.startsOn, overview.value.event.endsOn));
watch(days, (list) => {
  if (list.length > 1 && !list.includes(form.value.day)) form.value.day = list[0]!;
}, { immediate: true });
// Rotating partners have their own format, and only they use it
const variants = computed(() =>
  generateVariants(form.value.expected, { ...formatSettings(settings.value), rotation: form.value.kind === 'rotation' ? 'only' : 'exclude' }),
);
watch(
  variants,
  (list) => {
    if (!list.some((v) => v.id === form.value.variantId)) form.value.variantId = list[0]?.id ?? '';
  },
  { immediate: true },
);
const chosenFormat = computed(() => variants.value.find((v) => v.id === form.value.variantId)?.format);
const error = ref('');

async function create() {
  error.value = '';
  const variant = variants.value.find((v) => v.id === form.value.variantId);
  if (!variant) return;
  try {
    const { competition } = await api<{ competition: CompetitionInfo }>('POST', `/api/events/${overview.value.event.id}/competitions`, {
      name: form.value.name,
      kind: form.value.kind,
      gamesToWin: form.value.gamesToWin,
      format: variant.format,
      ...(days.value.length > 1 && form.value.day && { day: form.value.day }),
    });
    await live.reload();
    await router.push(`/admin/events/${overview.value.event.id}/competitions/${competition.id}`);
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
</script>

<template>
  <div class="stack">
    <section v-if="overview.competitions.length > 0" class="card">
      <ul class="link-list">
        <li v-for="c in overview.competitions" :key="c.id">
          <span class="swatch" :style="{ background: `var(--series-${c.color + 1})` }" aria-hidden="true"></span>
          <RouterLink :to="`/admin/events/${overview.event.id}/competitions/${c.id}`">{{ c.name }}</RouterLink>
          <span class="muted"> · {{ t(`admin.competitions.kinds.${c.kind}`) }}</span>
          <span v-if="c.day && days.length > 1" class="muted"> · {{ d(dayDate(c.day), { weekday: 'short', day: 'numeric', month: 'short' }) }}</span>
          <span v-if="c.drawn" class="badge">{{ t('admin.competitions.drawn') }}</span>
        </li>
      </ul>
    </section>

    <section v-if="session.isAdmin" class="card" aria-labelledby="create-competition">
      <h2 id="create-competition"><Plus aria-hidden="true" />{{ t('admin.competitions.create') }}</h2>
      <form class="fields" @submit.prevent="create">
        <label class="field">
          <span>{{ t('admin.competitions.name') }}</span>
          <input v-model="form.name" type="text" required maxlength="80" />
        </label>
        <label v-if="days.length > 1" class="field">
          <span>{{ t('admin.schedule.day') }}</span>
          <select v-model="form.day">
            <option v-for="day in days" :key="day" :value="day">{{ d(dayDate(day), { weekday: 'long', day: 'numeric', month: 'long' }) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('admin.competitions.kind') }}</span>
          <select v-model="form.kind">
            <option value="singles">{{ t('admin.competitions.kinds.singles') }}</option>
            <option value="doubles">{{ t('admin.competitions.kinds.doubles') }}</option>
            <option value="rotation">{{ t('admin.competitions.kinds.rotation') }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('planner.competitions.bestOf') }}</span>
          <select v-model.number="form.gamesToWin">
            <option v-for="n in [1, 2, 3, 4]" :key="n" :value="n">{{ t('planner.competitions.bestOfOption', { n: 2 * n - 1 }) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t(form.kind === 'rotation' ? 'admin.competitions.expectedPlayers' : 'admin.competitions.expectedEntries') }}</span>
          <input v-model.number="form.expected" type="number" min="2" max="128" inputmode="numeric" />
        </label>
        <label class="field wide">
          <span>{{ t('planner.competitions.format') }}</span>
          <select v-model="form.variantId">
            <option v-for="v in variants" :key="v.id" :value="v.id">{{ describeFormat(t, v.format, form.expected) }}</option>
          </select>
        </label>
        <FormatSettingsFields v-model="settings" :format="chosenFormat" :entry-count="form.expected" />
        <div class="field form-actions">
          <button type="submit" class="button" :disabled="!form.variantId">{{ t('admin.competitions.create') }}</button>
        </div>
      </form>
      <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    </section>
  </div>
</template>
