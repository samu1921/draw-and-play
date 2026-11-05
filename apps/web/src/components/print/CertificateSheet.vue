<script setup lang="ts">
import type { CertificateLines } from '../../lib/certificate.js';

/** One certificate, A4 landscape. Font sizes follow its width, so the editor's small preview matches the print. */
defineProps<{
  /** Texts with the placeholders already filled in; empty lines are left out */
  lines: Required<CertificateLines>;
  signatures: string[];
  mode: 'designed' | 'textOnly';
  logoUrl?: string | null;
  backgroundUrl?: string | null;
}>();
</script>

<template>
  <article class="certificate" :class="[mode, { 'has-bg': mode === 'designed' && backgroundUrl }]">
    <img v-if="mode === 'designed' && backgroundUrl" :src="backgroundUrl" alt="" class="certificate-bg" />
    <div class="certificate-content">
      <img v-if="mode === 'designed' && logoUrl" :src="logoUrl" alt="" class="certificate-logo" />
      <p v-if="lines.top" class="certificate-event">{{ lines.top }}</p>
      <h2 v-if="lines.title" class="certificate-title">{{ lines.title }}</h2>
      <p v-if="lines.name" class="certificate-name">{{ lines.name }}</p>
      <p v-if="lines.sub" class="certificate-club">{{ lines.sub }}</p>
      <p v-if="lines.place" class="certificate-place">{{ lines.place }}</p>
      <p v-if="lines.text" class="certificate-competition">{{ lines.text }}</p>
      <p v-if="lines.bottom" class="certificate-date">{{ lines.bottom }}</p>
      <div v-if="signatures.some(Boolean)" class="certificate-signatures">
        <div v-for="(caption, i) in signatures.filter(Boolean)" :key="i" class="certificate-signature">
          <span class="certificate-signature-line"></span>
          <span>{{ caption }}</span>
        </div>
      </div>
    </div>
  </article>
</template>
