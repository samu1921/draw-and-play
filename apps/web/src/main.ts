import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import { router } from './router.js';
import './style.css';

createApp(App).use(createPinia()).use(i18n).use(router).mount('#app');
