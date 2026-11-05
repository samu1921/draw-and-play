<script setup lang="ts">
import { ArrowLeft, ExternalLink, LayoutDashboard, Monitor, Play, Printer, ScrollText, Settings, Trophy, Users } from '@lucide/vue';
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import StreamBadge from '../../components/live/StreamBadge.vue';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { errorText } from '../../lib/messages.js';
import { useSessionStore } from '../../stores/session.js';

const { t, te, d } = useI18n();
const route = useRoute();
const eventId = computed(() => route.params.eventId as string);
const live = useLiveEvent(eventId, { operations: true });
const event = computed(() => live.overview.value?.event ?? null);

const session = useSessionStore();

interface Section {
  to: string;
  label: string;
  icon: Component;
  exact?: boolean;
  adminOnly?: boolean;
  /** Settings and log sit apart at the end of the list */
  secondary?: boolean;
}

/**
 * The match desk comes right after the overview: on the day, it is where the tournament is run.
 * The registration desk sees the overview, players, competitions (entries) and print pages only.
 */
const sections = computed<Section[]>(() => {
  const base = `/admin/events/${eventId.value}`;
  return (
    [
      { to: base, label: t('admin.tabs.overview'), icon: LayoutDashboard, exact: true },
      { to: `${base}/desk`, label: t('admin.tabs.desk'), icon: Play, adminOnly: true },
      { to: `${base}/persons`, label: t('admin.tabs.persons'), icon: Users },
      { to: `${base}/competitions`, label: t('admin.tabs.competitions'), icon: Trophy },
      { to: `${base}/displays`, label: t('admin.tabs.displays'), icon: Monitor, adminOnly: true },
      { to: `${base}/print`, label: t('admin.tabs.print'), icon: Printer },
      { to: `${base}/settings`, label: t('admin.tabs.setup'), icon: Settings, adminOnly: true, secondary: true },
      { to: `${base}/audit`, label: t('admin.tabs.audit'), icon: ScrollText, adminOnly: true, secondary: true },
    ] satisfies Section[]
  ).filter((s) => session.isAdmin || !s.adminOnly);
});

const isActive = (s: Section) => (s.exact ? route.path === s.to : route.path === s.to || route.path.startsWith(`${s.to}/`));
const current = computed(() => sections.value.find(isActive) ?? null);
/** A competition's own page names the competition itself; above it, the way back to the list */
const inCompetition = computed(() => route.name === 'admin-competition');

const dateLine = computed(() => {
  const e = event.value;
  if (!e?.startsOn) return '';
  return d(new Date(`${e.startsOn}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
});
const publicLink = computed(() =>
  event.value ? `/e/${event.value.slug}${event.value.viewerCode ? `?code=${event.value.viewerCode}` : ''}` : '',
);
</script>

<template>
  <div class="event-layout">
    <aside class="event-sidebar">
      <RouterLink to="/admin" class="back-link small"><ArrowLeft aria-hidden="true" />{{ t('admin.events.all') }}</RouterLink>
      <div class="event-heading">
        <h1>{{ event?.name ?? t('common.loading') }}</h1>
        <p class="muted small">
          <span v-if="dateLine">{{ dateLine }} · </span>
          <StreamBadge :status="live.status.value" />
        </p>
      </div>
      <nav class="event-nav" :aria-label="t('admin.tabs.label')">
        <template v-for="(s, i) in sections" :key="s.to">
          <hr v-if="s.secondary && !sections[i - 1]?.secondary" class="event-nav-separator" />
          <RouterLink :to="s.to" :class="{ active: isActive(s) }" :aria-current="isActive(s) ? 'page' : undefined">
            <component :is="s.icon" aria-hidden="true" />
            <span>{{ s.label }}</span>
          </RouterLink>
        </template>
      </nav>
      <a v-if="event" :href="publicLink" target="_blank" rel="noopener" class="sidebar-extra small">
        <ExternalLink aria-hidden="true" />{{ t('admin.setup.publicView') }}
      </a>
    </aside>

    <div class="event-content">
      <p v-if="live.error.value" class="warning-text" role="alert">{{ errorText(t, te, live.error.value) }}</p>
      <RouterLink v-if="current && inCompetition" :to="current.to" class="back-link small">
        <ArrowLeft aria-hidden="true" />{{ current.label }}
      </RouterLink>
      <p v-else-if="current" class="section-title">
        <component :is="current.icon" aria-hidden="true" />
        {{ current.label }}
      </p>
      <RouterView v-if="live.overview.value" />
    </div>
  </div>
</template>
