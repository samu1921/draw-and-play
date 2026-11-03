<script setup lang="ts">
import QRCode from 'qrcode';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useLiveEvent } from '../../composables/useLiveEvent.js';

const { t } = useI18n();
const route = useRoute();
const eventId = computed(() => route.params.eventId as string);
const live = useLiveEvent(eventId);
const print = () => window.print();

const codes = ref<{ name: string; url: string; svg: string }[]>([]);
watch(
  () => live.overview.value,
  async (overview) => {
    if (!overview) return;
    codes.value = await Promise.all(
      overview.tables.map(async (table) => {
        const url = `${window.location.origin}/e/${overview.event.slug}/table/${encodeURIComponent(table.name)}`;
        // The SVG comes from the QR library and only encodes our own URL, so rendering it as HTML is safe.
        return { name: table.name, url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) };
      }),
    );
  },
  { immediate: true },
);
</script>

<template>
  <div class="qr-sheet">
    <header class="qr-head no-print">
      <h1>{{ t('qr.title') }}</h1>
      <p class="muted">{{ t('qr.hint') }}</p>
      <button type="button" class="button" @click="print">{{ t('qr.print') }}</button>
    </header>
    <div class="qr-grid">
      <article v-for="code in codes" :key="code.name" class="qr-card">
        <h2>{{ t('qr.table', { name: code.name }) }}</h2>
        <div class="qr-code" v-html="code.svg"></div>
        <p>{{ t('qr.scan') }}</p>
        <p class="qr-url">{{ code.url }}</p>
        <p class="qr-event">{{ live.overview.value?.event.name }}</p>
      </article>
    </div>
  </div>
</template>
