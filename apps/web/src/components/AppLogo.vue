<script setup lang="ts">
/** The draw-and-play mark: two bracket lines meeting in a ball. Takes the accent colour of the page. */
defineProps<{ size?: number }>();
</script>

<template>
  <svg class="app-logo" :width="size ?? 28" :height="size ?? 28" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M8 9h6v14H8M14 16h4.5" fill="none" stroke="var(--accent-contrast, #fff)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="23" cy="16" r="3.2" fill="var(--accent-contrast, #fff)" />
  </svg>
</template>
