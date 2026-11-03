import { createI18n } from 'vue-i18n';
import de from './locales/de.js';
import en from './locales/en.js';

export const locales = { en: 'English', de: 'Deutsch' } as const;
export type Locale = keyof typeof locales;

const STORAGE_KEY = 'draw-and-play.locale';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in locales;
}

/** Stored choice first, then the browser language, then English. */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage may be blocked (private mode); fall through to detection.
  }
  const browser = navigator.language.slice(0, 2);
  return isLocale(browser) ? browser : 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, de },
});

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not persisted; the choice still applies to this page view.
  }
}

document.documentElement.lang = i18n.global.locale.value;
