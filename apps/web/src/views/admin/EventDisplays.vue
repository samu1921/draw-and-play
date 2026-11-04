<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type DisplayProfile, type DisplaySettings } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';
import { useSessionStore } from '../../stores/session.js';

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();
const live = injectLiveEvent();
const session = useSessionStore();
const event = computed(() => live.overview.value!.event);
const competitions = computed(() => live.overview.value!.competitions);

const profiles = ref<DisplayProfile[]>([]);
const error = ref('');
const message = ref('');
async function load() {
  profiles.value = (await api<{ displays: DisplayProfile[] }>('GET', `/api/events/${event.value.id}/displays`)).displays;
}
void load().catch((e) => (error.value = errorText(t, te, e)));
live.onChange((messages) => {
  if (messages.length === 0 || messages.some((m) => m.type === 'display')) void load();
});

async function run(action: () => Promise<unknown>, success = '') {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    await load();
  }
}

// The profile being edited is part of the URL, so a link can open it directly.
const selectedId = computed(() => (typeof route.query.profile === 'string' ? route.query.profile : (profiles.value[0]?.id ?? null)));
const selected = computed(() => profiles.value.find((p) => p.id === selectedId.value) ?? null);
const select = (id: string) => router.replace({ query: { ...route.query, profile: id } });

const displayPath = (p: DisplayProfile) => `/e/${event.value.slug}/display/${p.id}`;
const displayUrl = (p: DisplayProfile) => new URL(displayPath(p), window.location.origin).toString();
const copied = ref('');
async function copyLink(p: DisplayProfile) {
  await navigator.clipboard?.writeText(displayUrl(p)).catch(() => {});
  copied.value = p.id;
  setTimeout(() => (copied.value = ''), 2000);
}

// --- Create, duplicate, delete ---
const newName = ref('');
const create = (name: string, settings?: DisplaySettings) =>
  run(async () => {
    const { display } = await api<{ display: DisplayProfile }>('POST', `/api/events/${event.value.id}/displays`, { name, ...(settings && { settings }) });
    newName.value = '';
    await load();
    await select(display.id);
  });
const duplicate = (p: DisplayProfile) => create(t('admin.displays.copyName', { name: p.name }).slice(0, 60), p.settings);
const remove = (p: DisplayProfile) => {
  if (!confirm(t('admin.displays.deleteConfirm', { name: p.name }))) return;
  void run(async () => {
    await api('DELETE', `/api/displays/${p.id}`);
    if (selectedId.value === p.id) await router.replace({ query: {} });
  });
};

// --- Editing: a draft of the selected profile, refreshed from the server while it has no unsaved changes ---
const draft = ref<{ name: string; settings: DisplaySettings } | null>(null);
const pristine = ref('');
const dirty = computed(() => draft.value !== null && JSON.stringify(draft.value) !== pristine.value);
watch(
  selected,
  (p, previous) => {
    if (!p) return (draft.value = null);
    if (dirty.value && previous?.id === p.id) return;
    draft.value = { name: p.name, settings: { ...p.settings, competitionIds: p.settings.competitionIds && [...p.settings.competitionIds] } };
    pristine.value = JSON.stringify(draft.value);
  },
  { immediate: true },
);

const allCompetitions = computed({
  get: () => draft.value?.settings.competitionIds === null,
  set: (all: boolean) => {
    if (draft.value) draft.value.settings.competitionIds = all ? null : competitions.value.map((c) => c.id);
  },
});
function toggleCompetition(id: string, on: boolean) {
  const s = draft.value!.settings;
  const ids = new Set(s.competitionIds ?? []);
  if (on) ids.add(id);
  else ids.delete(id);
  // Keep the event's order
  s.competitionIds = competitions.value.map((c) => c.id).filter((c) => ids.has(c));
}

const save = () =>
  run(async () => {
    const p = selected.value!;
    const { display } = await api<{ display: DisplayProfile }>('PATCH', `/api/displays/${p.id}`, { ...draft.value, version: p.version });
    draft.value = { name: display.name, settings: display.settings };
    pristine.value = JSON.stringify(draft.value);
  }, t('admin.setup.saved'));
const reset = () => {
  if (selected.value) draft.value = JSON.parse(pristine.value);
};

const slideOptions = ['tables', 'next', 'entries', 'liveDraw', 'todayOnly'] as const;
</script>

<template>
  <div class="displays">
    <section class="card" aria-labelledby="displays-title">
      <h2 id="displays-title">{{ t('admin.displays.title') }}</h2>
      <p class="muted small">{{ t('admin.displays.intro') }}</p>
      <p v-if="profiles.length === 0" class="muted">{{ t('admin.displays.none') }}</p>
      <ul v-else class="display-list">
        <li v-for="p in profiles" :key="p.id" :class="{ active: p.id === selectedId }">
          <button type="button" class="link-button display-pick" :aria-current="p.id === selectedId" @click="select(p.id)">
            <strong>{{ p.name }}</strong>
            <span class="muted small">
              {{ p.createdBy === session.user?.username ? t('admin.displays.mine') : p.createdBy ? t('admin.displays.by', { name: p.createdBy }) : '' }}
            </span>
          </button>
          <div class="button-row">
            <a class="button secondary small" :href="displayPath(p)" target="_blank" rel="noopener">{{ t('admin.displays.open') }}</a>
            <button type="button" class="button secondary small" @click="copyLink(p)">
              {{ copied === p.id ? t('admin.displays.copied') : t('admin.displays.copyLink') }}
            </button>
            <button type="button" class="button secondary small" @click="duplicate(p)">{{ t('admin.displays.duplicate') }}</button>
            <button type="button" class="button icon" :aria-label="`${t('common.delete')}: ${p.name}`" @click="remove(p)">×</button>
          </div>
        </li>
      </ul>
      <form class="fields" @submit.prevent="create(newName)">
        <label class="field grow">
          <span>{{ t('admin.displays.newName') }}</span>
          <input v-model="newName" type="text" required maxlength="60" :placeholder="t('admin.displays.newPlaceholder')" />
        </label>
        <div class="field form-actions">
          <button type="submit" class="button">{{ t('admin.displays.create') }}</button>
        </div>
      </form>
      <p class="muted small">
        {{ t('admin.displays.defaultHint') }}
        <a :href="`/e/${event.slug}/display`" target="_blank" rel="noopener">{{ t('admin.displays.defaultLink') }}</a>
      </p>
    </section>

    <section v-if="selected && draft" class="card" aria-labelledby="display-edit-title">
      <h2 id="display-edit-title">{{ t('admin.displays.edit', { name: selected.name }) }}</h2>
      <form class="stack" @submit.prevent="save">
        <div class="fields">
          <label class="field">
            <span>{{ t('admin.displays.name') }}</span>
            <input v-model="draft.name" type="text" required maxlength="60" />
          </label>
          <label class="field">
            <span>{{ t('admin.displays.slideSeconds') }}</span>
            <input v-model.number="draft.settings.slideSeconds" type="number" min="5" max="600" required inputmode="numeric" />
          </label>
        </div>

        <fieldset class="plain-fieldset">
          <legend>{{ t('admin.displays.content') }}</legend>
          <label v-for="key in slideOptions" :key="key" class="check">
            <input v-model="draft.settings[key]" type="checkbox" />
            {{ t(`admin.displays.options.${key}`) }}
          </label>
        </fieldset>

        <fieldset class="plain-fieldset">
          <legend>{{ t('admin.displays.competitions') }}</legend>
          <label class="check">
            <input v-model="allCompetitions" type="checkbox" />
            {{ t('admin.displays.allCompetitions') }}
          </label>
          <div v-if="!allCompetitions" class="check-grid">
            <label v-for="c in competitions" :key="c.id" class="check">
              <input
                type="checkbox"
                :checked="draft.settings.competitionIds?.includes(c.id)"
                @change="toggleCompetition(c.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="swatch" :style="{ background: `var(--series-${c.color + 1})` }" aria-hidden="true"></span>
              {{ c.name }}
            </label>
          </div>
        </fieldset>

        <div class="button-row">
          <button type="submit" class="button" :disabled="!dirty">{{ t('common.save') }}</button>
          <button v-if="dirty" type="button" class="button secondary" @click="reset">{{ t('admin.displays.discard') }}</button>
          <span v-if="message" class="muted" role="status">{{ message }}</span>
        </div>
      </form>

      <div class="display-preview">
        <p class="muted small">{{ t('admin.displays.preview') }}</p>
        <div class="display-preview-frame">
          <iframe :key="selected.id" :src="displayPath(selected)" :title="t('admin.displays.preview')" loading="lazy"></iframe>
        </div>
        <p class="muted small">{{ t('admin.displays.controlsHint') }}</p>
      </div>
    </section>

    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </div>
</template>
