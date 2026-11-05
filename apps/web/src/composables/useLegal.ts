import { computed, ref } from 'vue';
import { api } from '../lib/api.js';
import type { LiveEvent } from './useLiveEvent.js';

export interface LegalLinks {
  imprintUrl: string | null;
  privacyUrl: string | null;
}

// Loaded once per page load: the installation's defaults rarely change
const defaults = ref<LegalLinks>({ imprintUrl: null, privacyUrl: null });
let loading: Promise<void> | null = null;
function loadDefaults() {
  loading ??= api<{ legal: LegalLinks }>('GET', '/api/config')
    .then((config) => void (defaults.value = config.legal))
    .catch(() => {
      loading = null;
    });
}

/** The installation's legal links (IMPRINT_URL / PRIVACY_URL) */
export function useLegalDefaults() {
  loadDefaults();
  return defaults;
}

/** Footer links of an event page: the event's own, else the installation's; also while the page is locked */
export function useEventLegal(live: LiveEvent) {
  const fallback = useLegalDefaults();
  return computed(() => {
    const own = live.overview.value?.event.legal;
    if (own) return own;
    const locked = live.locked.value;
    return {
      imprintUrl: locked?.imprintUrl || fallback.value.imprintUrl,
      privacyUrl: locked?.privacyUrl || fallback.value.privacyUrl,
      privacyNote: null,
    };
  });
}
