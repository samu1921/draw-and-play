import { ref } from 'vue';

/** "system" follows the operating system's light or dark setting */
export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

// Same key as public/theme-init.js, which applies the choice before the first paint
const STORAGE_KEY = 'draw-and-play.theme';

function stored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** The colour scheme chosen in this browser */
export const themePreference = ref<ThemePreference>(stored());

function apply(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  if (preference === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
}
apply(themePreference.value);

export function setThemePreference(preference: ThemePreference): void {
  themePreference.value = preference;
  apply(preference);
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Not stored: the choice applies to this page view only
  }
}

/** System → light → dark → system */
export function nextThemePreference(preference: ThemePreference): ThemePreference {
  return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length]!;
}
