<script setup lang="ts">
import { Calculator, CalendarDays, ChevronDown, Palette, CircleUser, Languages, LogIn, LogOut, Moon, Sun, SunMoon, UserCog } from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { locales, setLocale, type Locale } from './i18n/index.js';
import AppLogo from './components/AppLogo.vue';
import LegalFooter from './components/LegalFooter.vue';
import { useLegalDefaults } from './composables/useLegal.js';
import { appName, assetUrl, branding, loadConfig } from './lib/branding.js';
import { accentStyleSheet } from './lib/color.js';
import { composeTitle, eventTitle } from './lib/pageTitle.js';
import { nextThemePreference, setThemePreference, THEME_PREFERENCES, themePreference } from './lib/theme.js';
import { useSessionStore } from './stores/session.js';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const legal = useLegalDefaults();
const version = `v${__APP_VERSION__}`;

// Browser tab: "Match desk · VM 2026 – Draw & Play"
watchEffect(() => {
  document.title = composeTitle({
    page: route.meta.title ? t(route.meta.title) : null,
    event: eventTitle.value,
    app: appName.value,
    publicPage: route.meta.publicPage,
  });
});

// Look of the installation or the current event: accent colour and favicon
void loadConfig();
const accentStyle = document.createElement('style');
accentStyle.id = 'brand-accent';
document.head.append(accentStyle);
watchEffect(() => (accentStyle.textContent = branding.value.accent ? accentStyleSheet(branding.value.accent) : ''));
watchEffect(() => {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) return;
  const logo = branding.value.logoId;
  icon.href = logo ? assetUrl(logo) : '/favicon.svg';
  if (logo) icon.removeAttribute('type');
  else icon.type = 'image/svg+xml';
});

// --- User menu: account, appearance, language, sign-out ---
const menu = ref<HTMLDetailsElement | null>(null);
const closeMenu = () => menu.value?.removeAttribute('open');
watch(() => route.fullPath, closeMenu);
function onPointerDown(event: PointerEvent) {
  if (menu.value?.open && !menu.value.contains(event.target as Node)) closeMenu();
}
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menu.value?.open) {
    closeMenu();
    menu.value.querySelector('summary')?.focus();
  }
}

onMounted(() => {
  if (!session.checked) void session.check().catch(() => null);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onKeyDown);
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
    <RouterLink to="/" class="brand" :aria-label="appName">
      <img v-if="branding.logoId" :src="assetUrl(branding.logoId)" alt="" class="brand-logo" />
      <AppLogo v-else />
      <span>{{ appName }}</span>
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
      <RouterLink v-if="session.isAdmin" to="/admin/branding" active-class="active" :title="t('branding.title')">
        <Palette aria-hidden="true" /><span class="nav-label">{{ t('branding.title') }}</span>
      </RouterLink>
    </nav>
    <div class="header-tools">
      <details v-if="session.user" ref="menu" class="user-menu">
        <summary class="link-button" :title="t('nav.account')">
          <CircleUser aria-hidden="true" /><span class="nav-label">{{ session.user.username }}</span>
          <ChevronDown class="chevron" aria-hidden="true" />
        </summary>
        <div class="user-menu-panel">
          <p class="user-menu-name">{{ session.user.username }}</p>
          <RouterLink to="/account" class="user-menu-item"><CircleUser aria-hidden="true" />{{ t('nav.account') }}</RouterLink>
          <div class="user-menu-group" role="group" :aria-label="t('theme.label')">
            <span class="user-menu-label">{{ t('theme.label') }}</span>
            <div class="segmented">
              <button
                v-for="mode in THEME_PREFERENCES"
                :key="mode"
                type="button"
                :aria-pressed="themePreference === mode"
                @click="setThemePreference(mode)"
              >
                <component :is="themeIcons[mode]" aria-hidden="true" />{{ t(`theme.${mode}`) }}
              </button>
            </div>
          </div>
          <label class="user-menu-group">
            <span class="user-menu-label">{{ t('language.label') }}</span>
            <select :value="locale" @change="onLocaleChange">
              <option v-for="(name, code) in locales" :key="code" :value="code">{{ name }}</option>
            </select>
          </label>
          <button type="button" class="user-menu-item" @click="logout"><LogOut aria-hidden="true" />{{ t('nav.logout') }}</button>
        </div>
      </details>
      <template v-else>
        <RouterLink v-if="route.name !== 'login'" to="/login" class="link-button">
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
      </template>
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
