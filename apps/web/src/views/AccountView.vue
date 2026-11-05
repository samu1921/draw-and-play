<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api.js';
import { errorText } from '../lib/messages.js';
import { useSessionStore } from '../stores/session.js';

const { t, te } = useI18n();
const session = useSessionStore();
const form = ref({ current: '', next: '', repeat: '' });
const error = ref('');
const message = ref('');

async function change() {
  error.value = '';
  message.value = '';
  if (form.value.next !== form.value.repeat) {
    error.value = t('account.mismatch');
    return;
  }
  try {
    await api('POST', '/api/auth/password', { current: form.value.current, next: form.value.next });
    form.value = { current: '', next: '', repeat: '' };
    message.value = t('account.changed');
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
</script>

<template>
  <div class="page stack">
    <h1>{{ t('account.title') }}</h1>
    <section class="card stack" aria-labelledby="account-password">
      <p>
        {{ session.user?.username }} · <span class="muted">{{ session.user ? t(`users.roles.${session.user.role}`) : '' }}</span>
      </p>
      <h2 id="account-password">{{ t('account.password') }}</h2>
      <form class="fields" @submit.prevent="change">
        <label class="field">
          <span>{{ t('account.current') }}</span>
          <input v-model="form.current" type="password" required autocomplete="current-password" />
        </label>
        <label class="field">
          <span>{{ t('account.next') }}</span>
          <input v-model="form.next" type="password" required minlength="12" autocomplete="new-password" />
        </label>
        <label class="field">
          <span>{{ t('account.repeat') }}</span>
          <input v-model="form.repeat" type="password" required minlength="12" autocomplete="new-password" />
        </label>
        <div class="field form-actions">
          <button type="submit" class="button">{{ t('account.save') }}</button>
        </div>
      </form>
      <p class="muted small">{{ t('account.hint') }}</p>
      <p v-if="message" class="muted" role="status">{{ message }}</p>
      <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    </section>
  </div>
</template>
