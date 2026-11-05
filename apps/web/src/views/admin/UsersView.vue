<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';
import { useSessionStore, type UserRole } from '../../stores/session.js';

interface Account {
  id: string;
  username: string;
  role: UserRole;
}

const { t, te } = useI18n();
const session = useSessionStore();
const accounts = ref<Account[]>([]);
const form = ref({ username: '', password: '', role: 'desk' as UserRole });
const error = ref('');
const message = ref('');

async function load() {
  accounts.value = (await api<{ users: Account[] }>('GET', '/api/users')).users;
}
onMounted(() => void load().catch((e) => (error.value = errorText(t, te, e))));

async function run(action: () => Promise<unknown>, success = '') {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
    await load();
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}

const create = () =>
  run(async () => {
    await api('POST', '/api/users', form.value);
    form.value = { username: '', password: '', role: 'desk' };
  }, t('users.created'));
const setRole = (a: Account, role: UserRole) => run(() => api('PATCH', `/api/users/${a.id}`, { role }), t('users.saved'));
function resetPassword(a: Account) {
  const password = prompt(t('users.resetPrompt', { name: a.username }));
  if (password) void run(() => api('PATCH', `/api/users/${a.id}`, { password }), t('users.passwordReset', { name: a.username }));
}
function remove(a: Account) {
  if (confirm(t('users.deleteConfirm', { name: a.username }))) void run(() => api('DELETE', `/api/users/${a.id}`), t('users.deleted'));
}
</script>

<template>
  <div class="page stack">
    <h1>{{ t('users.title') }}</h1>
    <section class="card">
      <p class="muted small">{{ t('users.rolesHint') }}</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">{{ t('users.username') }}</th>
              <th scope="col">{{ t('users.role') }}</th>
              <th scope="col"><span class="visually-hidden">{{ t('users.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in accounts" :key="a.id">
              <th scope="row">
                {{ a.username }}
                <span v-if="a.id === session.user?.id" class="badge">{{ t('users.you') }}</span>
              </th>
              <td>
                <select :value="a.role" :aria-label="`${t('users.role')}: ${a.username}`" @change="setRole(a, ($event.target as HTMLSelectElement).value as UserRole)">
                  <option v-for="r in ['admin', 'desk'] as const" :key="r" :value="r">{{ t(`users.roles.${r}`) }}</option>
                </select>
              </td>
              <td class="button-row">
                <button type="button" class="button secondary small" @click="resetPassword(a)">{{ t('users.resetPassword') }}</button>
                <button v-if="a.id !== session.user?.id" type="button" class="button secondary small" @click="remove(a)">{{ t('common.delete') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card" aria-labelledby="create-user">
      <h2 id="create-user">{{ t('users.create') }}</h2>
      <form class="fields" @submit.prevent="create">
        <label class="field">
          <span>{{ t('users.username') }}</span>
          <input v-model.trim="form.username" type="text" required minlength="2" maxlength="100" autocomplete="off" />
        </label>
        <label class="field">
          <span>{{ t('users.password') }}</span>
          <input v-model="form.password" type="password" required minlength="12" maxlength="500" autocomplete="new-password" />
        </label>
        <label class="field">
          <span>{{ t('users.role') }}</span>
          <select v-model="form.role">
            <option v-for="r in ['desk', 'admin'] as const" :key="r" :value="r">{{ t(`users.roles.${r}`) }}</option>
          </select>
        </label>
        <div class="field form-actions">
          <button type="submit" class="button">{{ t('users.create') }}</button>
        </div>
      </form>
    </section>

    <p v-if="message" class="muted" role="status">{{ message }}</p>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </div>
</template>
