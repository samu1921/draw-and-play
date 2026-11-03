<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { locales, setLocale, type Locale } from './i18n/index.js';
import { useSessionStore } from './stores/session.js';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();

onMounted(() => {
  if (!session.checked) void session.check().catch(() => null);
});

function onLocaleChange(event: Event) {
  setLocale((event.target as HTMLSelectElement).value as Locale);
}

async function logout() {
  await session.logout();
  await router.push('/');
}
</script>

<template>
  <header v-if="!route.meta.bare" class="app-header">
    <RouterLink to="/" class="brand">draw-and-play</RouterLink>
    <nav class="app-nav">
      <RouterLink to="/">{{ t('nav.planner') }}</RouterLink>
      <RouterLink v-if="session.user" to="/admin">{{ t('nav.admin') }}</RouterLink>
      <RouterLink to="/status">{{ t('nav.status') }}</RouterLink>
    </nav>
    <button v-if="session.user" type="button" class="link-button" @click="logout">{{ t('nav.logout') }}</button>
    <RouterLink v-else to="/login" class="link-button">{{ t('nav.login') }}</RouterLink>
    <label class="locale">
      <span class="visually-hidden">{{ t('language.label') }}</span>
      <select :value="locale" @change="onLocaleChange">
        <option v-for="(name, code) in locales" :key="code" :value="code">{{ name }}</option>
      </select>
    </label>
  </header>
  <main :class="route.meta.bare ? 'bare-main' : 'app-main'">
    <RouterView />
  </main>
</template>
