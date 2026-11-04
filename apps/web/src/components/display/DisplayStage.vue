<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/** Logical size of the projector stage; everything inside is laid out in these pixels */
const WIDTH = 1920;
const HEIGHT = 1080;

// The stage is scaled as a whole to the window (letterboxed), so resolution, browser zoom and OS scaling
// never change the layout and nothing can ever scroll.
const scale = ref(1);
const fit = () => (scale.value = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT));
onMounted(() => {
  fit();
  window.addEventListener('resize', fit);
});
onBeforeUnmount(() => window.removeEventListener('resize', fit));
</script>

<template>
  <div class="stage-frame">
    <div class="stage" :style="{ width: `${WIDTH}px`, height: `${HEIGHT}px`, transform: `translate(-50%, -50%) scale(${scale})` }">
      <slot />
    </div>
  </div>
</template>
