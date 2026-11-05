<script setup lang="ts">
import { Award, Palette } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BrandingEditor from '../../components/admin/BrandingEditor.vue';
import CertificateEditor from '../../components/admin/CertificateEditor.vue';
import { api } from '../../lib/api.js';
import { installationBranding, installationCertificate, loadConfig, type Branding } from '../../lib/branding.js';
import type { CertificateTemplate } from '../../lib/certificate.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const draft = ref<Branding>({});
/** The look as last saved; the message shows while the form still matches it */
const savedState = ref<string | null>(null);
const saved = computed(() => savedState.value === JSON.stringify(draft.value));
const error = ref('');

// Certificate template, saved on its own
const certificate = ref<CertificateTemplate>({});
const certificateSavedState = ref<string | null>(null);
const certificateSaved = computed(() => certificateSavedState.value === JSON.stringify(certificate.value));
const certificateError = ref('');
async function saveCertificate() {
  certificateError.value = '';
  try {
    await api('PUT', '/api/certificate', certificate.value);
    await loadConfig(true);
    certificate.value = { ...installationCertificate.value };
    certificateSavedState.value = JSON.stringify(certificate.value);
  } catch (e) {
    certificateError.value = errorText(t, te, e);
  }
}

void loadConfig().then(() => {
  draft.value = { ...installationBranding.value };
  certificate.value = { ...installationCertificate.value };
});

async function save() {
  error.value = '';
  try {
    await api('PUT', '/api/branding', draft.value);
    await loadConfig(true);
    draft.value = { ...installationBranding.value };
    savedState.value = JSON.stringify(draft.value);
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
</script>

<template>
  <div class="page">
    <header class="page-title">
      <h1 class="with-icon"><Palette aria-hidden="true" />{{ t('branding.title') }}</h1>
      <button type="button" class="button" @click="save">{{ t('common.save') }}</button>
    </header>
    <p class="muted">{{ t('branding.intro') }}</p>
    <BrandingEditor v-model="draft" />
    <div class="button-row">
      <button type="button" class="button" @click="save">{{ t('common.save') }}</button>
      <span v-if="saved" class="muted" role="status">{{ t('admin.setup.saved') }}</span>
      <span v-if="error" class="warning-text" role="alert">{{ error }}</span>
    </div>

    <section class="card" aria-labelledby="certificate-title">
      <h2 id="certificate-title"><Award aria-hidden="true" />{{ t('certificate.title') }}</h2>
      <p class="muted small">{{ t('certificate.intro') }}</p>
      <CertificateEditor v-model="certificate" :logo-id="draft.logoId" />
      <div class="button-row">
        <button type="button" class="button" @click="saveCertificate">{{ t('certificate.save') }}</button>
        <span v-if="certificateSaved" class="muted" role="status">{{ t('admin.setup.saved') }}</span>
        <span v-if="certificateError" class="warning-text" role="alert">{{ certificateError }}</span>
      </div>
    </section>
  </div>
</template>
