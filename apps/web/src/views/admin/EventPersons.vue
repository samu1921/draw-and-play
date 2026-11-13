<script setup lang="ts">
import { Pencil, UserPlus, Users } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonImport from '../../components/admin/PersonImport.vue';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type PersonInfo } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';
import { duplicateNames, isDuplicate, listName } from '../../lib/persons.js';

const { t, te } = useI18n();
const live = injectLiveEvent();
const eventId = computed(() => live.overview.value!.event.id);
const persons = ref<PersonInfo[]>([]);
const error = ref('');
const empty = () => ({ firstName: '', lastName: '', club: '', rating: '' as number | '', birthYear: '' as number | '' });
const form = ref(empty());
const duplicates = computed(() => duplicateNames(persons.value));
const duplicateList = computed(() =>
  [...new Set(persons.value.filter((p) => isDuplicate(p, duplicates.value)).map((p) => p.publicName ?? p.name))].join(', '),
);

async function load() {
  persons.value = (await api<{ persons: PersonInfo[] }>('GET', `/api/events/${eventId.value}/persons`)).persons;
}
onMounted(load);
live.onChange(load);

async function add() {
  error.value = '';
  try {
    const f = form.value;
    await api('POST', `/api/events/${eventId.value}/persons`, {
      firstName: f.firstName,
      lastName: f.lastName.trim() || null,
      club: f.club || null,
      rating: f.rating === '' ? null : f.rating,
      birthYear: f.birthYear === '' ? null : f.birthYear,
    });
    form.value = { ...empty(), club: f.club };
    await load();
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}

// Correcting a person afterwards, e.g. a typo in the name: one row at a time, in place
const editingId = ref<string | null>(null);
const draft = ref(empty());
const editError = ref('');

function startEdit(p: PersonInfo) {
  editError.value = '';
  editingId.value = p.id;
  draft.value = { firstName: p.firstName ?? p.name, lastName: p.lastName ?? '', club: p.club ?? '', rating: p.rating ?? '', birthYear: p.birthYear ?? '' };
}

async function saveEdit() {
  if (!editingId.value) return;
  editError.value = '';
  const f = draft.value;
  if (!f.firstName.trim()) {
    editError.value = t('errors.firstNameRequired');
    return;
  }
  try {
    await api('PATCH', `/api/persons/${editingId.value}`, {
      firstName: f.firstName,
      lastName: f.lastName.trim(),
      club: f.club.trim() || null,
      rating: f.rating === '' ? null : f.rating,
      birthYear: f.birthYear === '' ? null : f.birthYear,
    });
    editingId.value = null;
    await load();
  } catch (e) {
    editError.value = errorText(t, te, e);
  }
}

async function remove(p: PersonInfo) {
  if (!confirm(t('admin.persons.deleteConfirm', { name: p.name }))) return;
  error.value = '';
  try {
    await api('DELETE', `/api/persons/${p.id}`);
    await load();
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
</script>

<template>
  <div class="stack">
    <section class="card" aria-labelledby="add-person">
      <h2 id="add-person"><UserPlus aria-hidden="true" />{{ t('admin.persons.add') }}</h2>
      <form class="fields" @submit.prevent="add">
        <label class="field">
          <span>{{ t('admin.persons.firstName') }}</span>
          <input v-model="form.firstName" type="text" required maxlength="80" />
        </label>
        <label class="field">
          <span>{{ t('admin.persons.lastName') }} ({{ t('common.optional') }})</span>
          <input v-model="form.lastName" type="text" maxlength="80" />
        </label>
        <label class="field">
          <span>{{ t('admin.persons.club') }}</span>
          <input v-model="form.club" type="text" maxlength="120" />
        </label>
        <label class="field">
          <span>{{ t('admin.persons.rating') }}</span>
          <input v-model.number="form.rating" type="number" min="0" max="4000" inputmode="numeric" />
        </label>
        <label class="field">
          <span>{{ t('admin.persons.birthYear') }}</span>
          <input v-model.number="form.birthYear" type="number" min="1900" max="2100" inputmode="numeric" />
        </label>
        <div class="field form-actions">
          <button type="submit" class="button">{{ t('common.add') }}</button>
        </div>
      </form>
      <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    </section>

    <PersonImport
      :event-id="eventId"
      :slug="live.overview.value!.event.slug"
      :persons="persons"
      :competitions="live.overview.value!.competitions"
      @done="load"
    />

    <section class="card" aria-labelledby="person-list">
      <h2 id="person-list"><Users aria-hidden="true" />{{ t('admin.persons.count', persons.length, { named: { n: persons.length } }) }}</h2>
      <p v-if="duplicates.size > 0" class="warning-text" role="status">{{ t('admin.persons.duplicates', { names: duplicateList }) }}</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">{{ t('admin.persons.lastName') }}, {{ t('admin.persons.firstName') }}</th>
              <th scope="col">{{ t('admin.persons.club') }}</th>
              <th scope="col" class="num">{{ t('admin.persons.rating') }}</th>
              <th scope="col" class="num">{{ t('admin.persons.birthYear') }}</th>
              <th scope="col"><span class="visually-hidden">{{ t('admin.persons.edit') }}, {{ t('common.delete') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in persons" :key="p.id">
            <tr v-if="editingId === p.id" class="person-edit" @keydown.enter.prevent="saveEdit" @keydown.esc="editingId = null">
              <th scope="row">
                <div class="person-edit-names">
                  <input v-model="draft.firstName" type="text" required maxlength="80" :aria-label="t('admin.persons.firstName')" :placeholder="t('admin.persons.firstName')" />
                  <input v-model="draft.lastName" type="text" maxlength="80" :aria-label="t('admin.persons.lastName')" :placeholder="t('admin.persons.lastName')" />
                </div>
              </th>
              <td><input v-model="draft.club" type="text" maxlength="120" :aria-label="t('admin.persons.club')" /></td>
              <td class="num"><input v-model.number="draft.rating" type="number" min="0" max="4000" inputmode="numeric" :aria-label="t('admin.persons.rating')" /></td>
              <td class="num"><input v-model.number="draft.birthYear" type="number" min="1900" max="2100" inputmode="numeric" :aria-label="t('admin.persons.birthYear')" /></td>
              <td>
                <div class="button-row">
                  <button type="button" class="button" @click="saveEdit">{{ t('common.save') }}</button>
                  <button type="button" class="button secondary" @click="editingId = null">{{ t('common.cancel') }}</button>
                </div>
              </td>
            </tr>
            <tr v-else>
              <th scope="row">
                {{ listName(p) }}
                <span v-if="isDuplicate(p, duplicates)" class="badge warning">{{ t('admin.persons.duplicateMark') }}</span>
              </th>
              <td>{{ p.club }}</td>
              <td class="num">{{ p.rating ?? '' }}</td>
              <td class="num">{{ p.birthYear ?? '' }}</td>
              <td>
                <div class="button-row nowrap">
                  <button type="button" class="button icon" :aria-label="t('admin.persons.editing', { name: p.name })" :title="t('admin.persons.edit')" @click="startEdit(p)">
                    <Pencil aria-hidden="true" />
                  </button>
                  <button type="button" class="button icon" :aria-label="`${t('common.delete')}: ${p.name}`" @click="remove(p)">×</button>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p v-if="editError" class="warning-text" role="alert">{{ editError }}</p>
    </section>
  </div>
</template>
