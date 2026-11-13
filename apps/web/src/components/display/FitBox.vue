<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Scales its content to use the box as fully as possible without scrolling: few groups or matches are shown
 * larger, content that would overflow (e.g. very long names) smaller.
 *
 * To enlarge, the content is laid out narrower (box width / scale) and then scaled up, so it still spans the
 * full width and its text wraps and truncates as it would at that size. The largest scale is taken at which
 * the content fits the height and nothing more overflows its place than at the normal size (e.g. names cut off
 * with an ellipsis, or a label pushed out of its card).
 */
const props = defineProps<{
  /**
   * The content keeps its layout while its text changes (a live draw only uncovers names that are laid out
   * from the start), so text changes are not re-measured: the scale stays the same through the whole reveal.
   */
  stable?: boolean;
}>();

const MAX_SCALE = 2.5;
const STEPS = 8;

const outer = ref<HTMLElement | null>(null);
const inner = ref<HTMLElement | null>(null);
const scale = ref(1);
/** Laid out narrower than the box and scaled up (its width is set in `measure`, not bound) */
const enlarged = ref(false);

/**
 * Elements whose content is wider than they are (cut off with an ellipsis, or sticking out), or that are wider
 * than their parent's content box (pushed into its padding, which `scrollWidth` does not report).
 */
function overflowing(root: HTMLElement, padding: Map<Element, number>): number {
  let count = 0;
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const parent = el.parentElement;
    if (el.scrollWidth > el.clientWidth + 1) count++;
    else if (parent && el.offsetWidth > parent.clientWidth - paddingOf(parent, padding) + 1) count++;
  }
  return count;
}

/** Horizontal padding, cached per measuring: it does not change with the layout width */
function paddingOf(el: Element, cache: Map<Element, number>): number {
  let value = cache.get(el);
  if (value === undefined) {
    const style = getComputedStyle(el);
    value = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    cache.set(el, value);
  }
  return value;
}

function measure() {
  const box = outer.value;
  const content = inner.value;
  if (!box || !content) return;
  const { clientWidth: boxWidth, clientHeight: boxHeight } = box;
  if (boxWidth === 0 || boxHeight === 0) return;

  const layoutAt = (s: number) => {
    content.style.width = `${boxWidth / s}px`;
    return { width: content.scrollWidth, height: content.scrollHeight };
  };
  const padding = new Map<Element, number>();
  const base = layoutAt(1);
  const baseOverflowing = overflowing(content, padding);
  const fits = (s: number) => {
    const size = layoutAt(s);
    return size.height * s <= boxHeight && size.width <= boxWidth / s + 1 && overflowing(content, padding) <= baseOverflowing;
  };

  let best = 1;
  if (base.height <= boxHeight && base.width <= boxWidth + 1) {
    // Fits as it is: search the largest scale that still fits
    if (fits(MAX_SCALE)) best = MAX_SCALE;
    else {
      let low = 1;
      let high = MAX_SCALE;
      for (let i = 0; i < STEPS; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid;
        else high = mid;
      }
      best = low;
    }
  } else {
    // Too large: shrink as a whole at the box width
    best = Math.min(boxWidth / Math.max(1, base.width), boxHeight / Math.max(1, base.height));
  }

  enlarged.value = best > 1.001;
  content.style.width = enlarged.value ? `${boxWidth / best}px` : '';
  scale.value = enlarged.value || best < 0.999 ? best : 1;
}

let observer: ResizeObserver | undefined;
let pending = 0;
// Re-measured once per frame at most; the measuring itself resizes the content, which would report back
const schedule = () => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(measure);
};
let mutations: MutationObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(schedule);
  observer.observe(outer.value!);
  // E.g. a logo or font that loads later; the size the measuring leaves behind is the one observed, so this settles
  observer.observe(inner.value!);
  // Data updates change the text without always changing the content's size (e.g. a longer name)
  if (!props.stable) {
    mutations = new MutationObserver(schedule);
    mutations.observe(inner.value!, { childList: true, subtree: true, characterData: true });
  }
  measure();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  mutations?.disconnect();
  cancelAnimationFrame(pending);
});
</script>

<template>
  <div ref="outer" class="fit-box">
    <div
      ref="inner"
      class="fit-box-content"
      :class="{ enlarged }"
      :style="{ transform: scale !== 1 ? `scale(${scale})` : undefined }"
    >
      <slot />
    </div>
  </div>
</template>
