<script setup lang="ts">
/**
 * The Draw & Play mark: a bracket (the draw) that runs into a play triangle (the play).
 * Takes the accent colour of the page.
 */
defineProps<{ size?: number }>();
</script>

<template>
  <svg class="app-logo" :width="size ?? 28" :height="size ?? 28" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M6.5 9h5.5v14H6.5M12 16h4" fill="none" stroke="var(--accent-contrast, #fff)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M18.5 10.2v11.6a1 1 0 0 0 1.5.86l9-5.8a1 1 0 0 0 0-1.72l-9-5.8a1 1 0 0 0-1.5.86z" fill="var(--accent-contrast, #fff)" />
  </svg>
</template>
