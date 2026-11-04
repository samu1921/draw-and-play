<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import StreamBadge from '../../components/live/StreamBadge.vue';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const route = useRoute();
const eventId = computed(() => route.params.eventId as string);
const live = useLiveEvent(eventId, { operations: true });

const tabs = computed(() => [
  { to: `/admin/events/${eventId.value}`, label: t('admin.tabs.setup'), exact: true },
  { to: `/admin/events/${eventId.value}/persons`, label: t('admin.tabs.persons') },
  { to: `/admin/events/${eventId.value}/competitions`, label: t('admin.tabs.competitions') },
  { to: `/admin/events/${eventId.value}/desk`, label: t('admin.tabs.desk') },
  { to: `/admin/events/${eventId.value}/displays`, label: t('admin.tabs.displays') },
]);
</script>

<template>
  <div class="page">
    <header class="page-title">
      <h1>{{ live.overview.value?.event.name ?? t('common.loading') }}</h1>
      <StreamBadge :status="live.status.value" />
    </header>
    <p v-if="live.error.value" class="warning-text" role="alert">{{ errorText(t, te, live.error.value) }}</p>
    <nav class="tabs" :aria-label="t('admin.events.title')">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        :class="{ active: tab.exact ? route.path === tab.to : route.path.startsWith(tab.to) }"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
    <RouterView v-if="live.overview.value" />
  </div>
</template>
