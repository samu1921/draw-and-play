<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { StreamStatus } from '../../composables/useEventStream.js';

defineProps<{ status: StreamStatus }>();
const { t } = useI18n();
</script>

<template>
  <span class="stream-badge" :class="status" role="status">
    <span class="dot" aria-hidden="true"></span>{{ t(`common.stream.${status}`) }}
  </span>
</template>
