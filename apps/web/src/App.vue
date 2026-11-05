<script setup lang="ts">
import { Calculator, CalendarDays, CircleUser, Languages, LogIn, LogOut, Moon, Sun, SunMoon, UserCog } from '@lucide/vue';
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { locales, setLocale, type Locale } from './i18n/index.js';
import AppLogo from './components/AppLogo.vue';
import LegalFooter from './components/LegalFooter.vue';
import { useLegalDefaults } from './composables/useLegal.js';
import { nextThemePreference, setThemePreference, themePreference } from './lib/theme.js';
import { useSessionStore } from './stores/session.js';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const legal = useLegalDefaults();
const version = `v${__APP_VERSION__}`;

onMounted(() => {
  if (!session.checked) void session.check().catch(() => null);
});

function onLocaleChange(event: Event) {
  setLocale((event.target as HTMLSelectElement).value as Locale);
}

async function logout() {
  await session.logout();
  await router.push('/login');
}

const themeIcons = { system: SunMoon, light: Sun, dark: Moon };
const cycleTheme = () => setThemePreference(nextThemePreference(themePreference.value));

/** "Events" stays highlighted inside an event; the planner and the users have their own entries */
const inEvents = () => route.path === '/admin' || route.path.startsWith('/admin/events');
</script>

<template>
  <header v-if="!route.meta.bare" class="app-header">
    <RouterLink to="/" class="brand">
      <AppLogo />
      <span>draw-and-play</span>
    </RouterLink>
    <nav v-if="session.user" class="app-nav" :aria-label="t('nav.label')">
      <RouterLink to="/admin" :class="{ active: inEvents() }" :title="t('nav.events')">
        <CalendarDays aria-hidden="true" /><span class="nav-label">{{ t('nav.events') }}</span>
      </RouterLink>
      <RouterLink to="/admin/planner" active-class="active" :title="t('nav.planner')">
        <Calculator aria-hidden="true" /><span class="nav-label">{{ t('nav.planner') }}</span>
      </RouterLink>
      <RouterLink v-if="session.isAdmin" to="/admin/users" active-class="active" :title="t('nav.users')">
        <UserCog aria-hidden="true" /><span class="nav-label">{{ t('nav.users') }}</span>
      </RouterLink>
    </nav>
    <div class="header-tools">
      <RouterLink v-if="session.user" to="/account" class="link-button" active-class="active" :title="t('nav.account')">
        <CircleUser aria-hidden="true" /><span class="nav-label">{{ session.user.username }}</span>
      </RouterLink>
      <button v-if="session.user" type="button" class="link-button" :title="t('nav.logout')" @click="logout">
        <LogOut aria-hidden="true" /><span class="visually-hidden">{{ t('nav.logout') }}</span>
      </button>
      <RouterLink v-else-if="route.name !== 'login'" to="/login" class="link-button">
        <LogIn aria-hidden="true" /><span>{{ t('nav.login') }}</span>
      </RouterLink>
      <button
        type="button"
        class="link-button"
        :title="t('theme.current', { mode: t(`theme.${themePreference}`) })"
        :aria-label="t('theme.current', { mode: t(`theme.${themePreference}`) })"
        @click="cycleTheme"
      >
        <component :is="themeIcons[themePreference]" aria-hidden="true" />
      </button>
      <label class="locale" :title="t('language.label')">
        <Languages aria-hidden="true" />
        <span class="visually-hidden">{{ t('language.label') }}</span>
        <select :value="locale" @change="onLocaleChange">
          <option v-for="(name, code) in locales" :key="code" :value="code">{{ name }}</option>
        </select>
      </label>
    </div>
  </header>
  <main :class="route.meta.bare ? 'bare-main' : 'app-main'">
    <RouterView />
  </main>
  <!-- Event pages show the event's own links -->
  <LegalFooter
    v-if="!route.meta.bare && !route.path.startsWith('/e/')"
    :imprint-url="legal.imprintUrl"
    :privacy-url="legal.privacyUrl"
    :version="version"
  />
</template>
