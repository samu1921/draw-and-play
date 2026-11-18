<script setup lang="ts">
import type { Placement } from '@draw-and-play/domain';

defineProps<{
  placements: Placement[];
  name: (entryId: string) => string;
}>();
const placeText = (p: Placement) => (p.place === p.placeTo ? `${p.place}.` : `${p.place}.–${p.placeTo}.`);
</script>

<template>
  <ol class="placement-list ranked">
    <li v-for="p in placements" :key="p.entryId" :class="p.place <= 3 ? `top top-${p.place}` : undefined">
      <span class="place">{{ placeText(p) }}</span>
      <span class="placement-name">{{ name(p.entryId) }}</span>
    </li>
  </ol>
</template>
