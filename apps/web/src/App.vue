<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterView } from 'vue-router';
import { locales, setLocale, type Locale } from './i18n/index.js';

const { t, locale } = useI18n();

function onLocaleChange(event: Event) {
  setLocale((event.target as HTMLSelectElement).value as Locale);
}
</script>

<template>
  <header class="app-header">
    <span class="brand">draw-and-play</span>
    <label class="locale">
      <span class="visually-hidden">{{ t('language.label') }}</span>
      <select :value="locale" @change="onLocaleChange">
        <option v-for="(name, code) in locales" :key="code" :value="code">{{ name }}</option>
      </select>
    </label>
  </header>
  <main class="app-main">
    <RouterView />
  </main>
</template>
