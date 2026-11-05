import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import './lib/theme.js';
import { router } from './router.js';
import './style.css';

createApp(App).use(createPinia()).use(i18n).use(router).mount('#app');

// Keeps the app shell available offline (see public/sw.js). Not in development, where Vite serves the files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without a service worker the app simply needs a connection to load
    });
  });
}
