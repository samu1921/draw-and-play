<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import StreamBadge from '../../components/live/StreamBadge.vue';
import ViewerGate from '../../components/live/ViewerGate.vue';
import { useLiveEvent } from '../../composables/useLiveEvent.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const route = useRoute();
const slug = computed(() => route.params.slug as string);
const live = useLiveEvent(slug, { operations: true });
</script>

<template>
  <div class="page">
    <header class="page-title">
      <h1>
        <RouterLink :to="`/e/${slug}`" class="plain-link">{{ live.overview.value?.event.name ?? live.locked.value?.name ?? t('common.loading') }}</RouterLink>
      </h1>
      <StreamBadge v-if="!live.locked.value" :status="live.status.value" />
    </header>
    <ViewerGate v-if="live.locked.value" />
    <p v-else-if="live.error.value" class="warning-text" role="alert">{{ errorText(t, te, live.error.value) }}</p>
    <nav v-if="live.overview.value" class="tabs" :aria-label="t('public.competitions')">
      <RouterLink :to="`/e/${slug}`" :class="{ active: route.name === 'public-event' }">{{ t('public.tables') }}</RouterLink>
      <RouterLink
        v-for="c in live.overview.value.competitions"
        :key="c.id"
        :to="`/e/${slug}/c/${c.id}`"
        :class="{ active: route.params.competitionId === c.id }"
      >
        <span class="swatch" :style="{ background: `var(--series-${c.color + 1})` }" aria-hidden="true"></span>
        {{ c.name }}
      </RouterLink>
    </nav>
    <RouterView v-if="live.overview.value" />
  </div>
</template>
