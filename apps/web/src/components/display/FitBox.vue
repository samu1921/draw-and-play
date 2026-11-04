<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Shrinks its content to fit when it would overflow (e.g. very long names), never enlarges it.
 * The paging in `displaySlides` keeps this rare; it is the safety net that rules out cut-off content.
 */
const outer = ref<HTMLElement | null>(null);
const inner = ref<HTMLElement | null>(null);
const scale = ref(1);

const measure = () => {
  if (!outer.value || !inner.value) return;
  const { clientWidth, clientHeight } = outer.value;
  const { scrollWidth, scrollHeight } = inner.value;
  scale.value = Math.min(1, clientWidth / Math.max(1, scrollWidth), clientHeight / Math.max(1, scrollHeight));
};

let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(measure);
  observer.observe(outer.value!);
  observer.observe(inner.value!);
  measure();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="outer" class="fit-box">
    <div ref="inner" class="fit-box-content" :style="{ transform: scale < 1 ? `scale(${scale})` : undefined }">
      <slot />
    </div>
  </div>
</template>
