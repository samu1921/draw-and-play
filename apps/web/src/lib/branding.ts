import { computed, onBeforeUnmount, ref, watchEffect, type Ref } from 'vue';
import { api } from './api.js';
import type { CertificateTemplate } from './certificate.js';
import { APP_NAME } from './pageTitle.js';

/** Look of the installation, or an event's own on top of it (see the server's `Branding`) */
export interface Branding {
  name?: string | null;
  accent?: string | null;
  logoId?: string | null;
  displayBackgroundId?: string | null;
  displayDim?: number | null;
}

export interface LegalLinks {
  imprintUrl: string | null;
  privacyUrl: string | null;
}

/** Darkening of the display background when nobody chose one */
export const DEFAULT_DISPLAY_DIM = 55;

export const assetUrl = (id: string) => `/api/assets/${id}`;

// --- Installation config, loaded once per page load ---

export const installationLegal = ref<LegalLinks>({ imprintUrl: null, privacyUrl: null });
export const installationBranding = ref<Branding>({});
export const installationCertificate = ref<CertificateTemplate>({});
let loading: Promise<void> | null = null;

export function loadConfig(force = false): Promise<void> {
  if (force) loading = null;
  loading ??= api<{ legal: LegalLinks; branding?: Branding; certificate?: CertificateTemplate }>('GET', '/api/config')
    .then((config) => {
      installationLegal.value = config.legal;
      installationBranding.value = config.branding ?? {};
      installationCertificate.value = config.certificate ?? {};
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

// --- The event shown right now ---

/** The event's own look while one of its pages is shown */
export const eventBranding = ref<Branding | null>(null);

/** Uses the event's look while the calling page is shown */
export function useEventBranding(branding: Ref<Branding | null | undefined>): void {
  watchEffect(() => (eventBranding.value = branding.value ?? null));
  onBeforeUnmount(() => (eventBranding.value = null));
}

/** Each field: the event's value if it has one, else the installation's */
export function mergeBranding(installation: Branding, own: Branding | null | undefined): Branding {
  const result: Branding = { ...installation };
  for (const [key, value] of Object.entries(own ?? {}) as [keyof Branding, Branding[keyof Branding]][]) {
    if (value !== null && value !== undefined && value !== '') (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

/** The look in effect on the current page */
export const branding = computed(() => mergeBranding(installationBranding.value, eventBranding.value));
/** Name shown top left and in the browser tab */
export const appName = computed(() => branding.value.name || APP_NAME);

export type AssetKind = 'logo' | 'displayBackground' | 'certificateBackground';
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Uploads an image for the installation (no `eventId`) or an event; returns its id */
export async function uploadAsset(file: File, kind: AssetKind, eventId?: string): Promise<string> {
  const query = new URLSearchParams({ kind, ...(eventId && { eventId }) });
  const { id } = await api<{ id: string }>('POST', `/api/assets?${query.toString()}`, file, { timeoutMs: 120_000 });
  return id;
}

/** Colours offered next to the free colour picker */
export const ACCENT_PRESETS = ['#1c5cab', '#b01e2d', '#0a7d3b', '#d9480f', '#6741d9', '#0b7285', '#343a40', '#e0a100'] as const;
