<script setup lang="ts">
import QRCode from 'qrcode';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useLiveEvent } from '../../composables/useLiveEvent.js';

/** A notice for the venue: QR code and viewer code for the public views */
const { t } = useI18n();
const route = useRoute();
const eventId = computed(() => route.params.eventId as string);
const live = useLiveEvent(eventId);
const print = () => window.print();

const code = computed(() => live.overview.value?.event.viewerCode ?? null);
const url = computed(() => (live.overview.value && code.value ? `${window.location.origin}/e/${live.overview.value.event.slug}?code=${code.value}` : ''));
const svg = ref('');
watch(
  url,
  async (value) => {
    // The SVG comes from the QR library and only encodes our own URL, so rendering it as HTML is safe.
    svg.value = value ? await QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : '';
  },
  { immediate: true },
);
</script>

<template>
  <div class="qr-sheet">
    <header class="qr-head no-print">
      <h1>{{ t('notice.title') }}</h1>
      <p class="muted">{{ t('notice.hint') }}</p>
      <button type="button" class="button" :disabled="!code" @click="print">{{ t('qr.print') }}</button>
    </header>
    <p v-if="live.overview.value && !code" class="muted">{{ t('admin.setup.viewerOff') }}</p>
    <article v-else-if="code" class="viewer-notice">
      <p class="viewer-notice-event">{{ live.overview.value?.event.name }}</p>
      <h2>{{ t('notice.heading') }}</h2>
      <p>{{ t('notice.scan') }}</p>
      <div class="qr-code viewer-notice-qr" v-html="svg"></div>
      <p class="viewer-notice-code">{{ t('notice.code') }} <strong>{{ code }}</strong></p>
      <p class="qr-url">{{ url.replace(/\?code=.*$/, '') }}</p>
    </article>
  </div>
</template>
