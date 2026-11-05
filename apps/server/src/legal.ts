import type { EventSettings } from './db/schema.js';

/** Links to the legal notice (Impressum) and the privacy policy, shown in the footer of the public pages */
export interface LegalLinks {
  imprintUrl: string | null;
  privacyUrl: string | null;
}

/** An event's own links win; the installation's defaults (IMPRINT_URL / PRIVACY_URL) fill the gaps. */
export function legalLinks(settings: EventSettings, defaults: LegalLinks): LegalLinks & { privacyNote: string | null } {
  return {
    imprintUrl: settings.imprintUrl || defaults.imprintUrl,
    privacyUrl: settings.privacyUrl || defaults.privacyUrl,
    privacyNote: settings.privacyNote || null,
  };
}
