import { onBeforeUnmount, ref, watchEffect, type Ref } from 'vue';

/** The product name as shown to people (the technical name stays draw-and-play) */
export const APP_NAME = 'Draw & Play';

/** Name of the event the current page belongs to; set by event pages while they are shown */
export const eventTitle = ref<string | null>(null);

/**
 * "Match desk · VM 2026 – Draw & Play": page, event and app, leaving out what is missing.
 * Public pages (`publicPage`) show the event alone, so a projector or a shared link names the tournament.
 */
export function composeTitle(parts: { page?: string | null; event?: string | null; app: string; publicPage?: boolean }): string {
  if (parts.publicPage) return parts.event || parts.app;
  const front = [parts.page, parts.event].filter(Boolean).join(' · ');
  return front ? `${front} – ${parts.app}` : parts.app;
}

/** Names the event in the browser tab while the calling page is shown */
export function useEventTitle(name: Ref<string | null | undefined>): void {
  watchEffect(() => (eventTitle.value = name.value || null));
  onBeforeUnmount(() => (eventTitle.value = null));
}
