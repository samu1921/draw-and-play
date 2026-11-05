<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AppLogo from '../components/AppLogo.vue';
import { errorText } from '../lib/messages.js';
import { APP_NAME } from '../lib/pageTitle.js';
import { useSessionStore } from '../stores/session.js';

const { t, te } = useI18n();
const session = useSessionStore();
const router = useRouter();
const route = useRoute();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await session.login(username.value, password.value);
    const target = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/admin';
    await router.replace(target);
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="card narrow login-card">
    <div class="login-brand">
      <AppLogo :size="48" />
      <div>
        <p class="login-app">{{ APP_NAME }}</p>
        <p class="muted small">{{ t('login.tagline') }}</p>
      </div>
    </div>
    <h1>{{ t('login.title') }}</h1>
    <form class="stack" @submit.prevent="submit">
      <label class="field">
        <span>{{ t('login.username') }}</span>
        <input v-model="username" type="text" autocomplete="username" required />
      </label>
      <label class="field">
        <span>{{ t('login.password') }}</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
      <button type="submit" class="button" :disabled="busy">{{ t('login.submit') }}</button>
    </form>
  </section>
</template>
