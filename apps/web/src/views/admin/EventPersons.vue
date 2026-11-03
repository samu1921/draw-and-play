<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type PersonInfo } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const live = injectLiveEvent();
const eventId = computed(() => live.overview.value!.event.id);
const persons = ref<PersonInfo[]>([]);
const error = ref('');
const empty = () => ({ firstName: '', lastName: '', club: '', rating: '' as number | '', birthYear: '' as number | '' });
const form = ref(empty());

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
      lastName: f.lastName,
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
      <h2 id="add-person">{{ t('admin.persons.add') }}</h2>
      <form class="fields" @submit.prevent="add">
        <label class="field">
          <span>{{ t('admin.persons.firstName') }}</span>
          <input v-model="form.firstName" type="text" required maxlength="80" />
        </label>
        <label class="field">
          <span>{{ t('admin.persons.lastName') }}</span>
          <input v-model="form.lastName" type="text" required maxlength="80" />
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

    <section class="card" aria-labelledby="person-list">
      <h2 id="person-list">{{ t('admin.persons.count', persons.length, { named: { n: persons.length } }) }}</h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">{{ t('admin.persons.lastName') }}, {{ t('admin.persons.firstName') }}</th>
              <th scope="col">{{ t('admin.persons.club') }}</th>
              <th scope="col" class="num">{{ t('admin.persons.rating') }}</th>
              <th scope="col" class="num">{{ t('admin.persons.birthYear') }}</th>
              <th scope="col"><span class="visually-hidden">{{ t('common.delete') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in persons" :key="p.id">
              <th scope="row">{{ p.lastName }}, {{ p.firstName }}</th>
              <td>{{ p.club }}</td>
              <td class="num">{{ p.rating ?? '' }}</td>
              <td class="num">{{ p.birthYear ?? '' }}</td>
              <td>
                <button type="button" class="button icon" :aria-label="`${t('common.delete')}: ${p.name}`" @click="remove(p)">×</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
