import { computed } from 'vue';
import { installationLegal, loadConfig, type LegalLinks } from '../lib/branding.js';
import type { LiveEvent } from './useLiveEvent.js';

export type { LegalLinks };

/** The installation's legal links (IMPRINT_URL / PRIVACY_URL) */
export function useLegalDefaults() {
  void loadConfig();
  return installationLegal;
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
