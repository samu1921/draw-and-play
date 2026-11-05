<script setup lang="ts">
import { Palette } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BrandingEditor from '../../components/admin/BrandingEditor.vue';
import { api } from '../../lib/api.js';
import { installationBranding, loadConfig, type Branding } from '../../lib/branding.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const draft = ref<Branding>({});
/** The look as last saved; the message shows while the form still matches it */
const savedState = ref<string | null>(null);
const saved = computed(() => savedState.value === JSON.stringify(draft.value));
const error = ref('');

void loadConfig().then(() => (draft.value = { ...installationBranding.value }));

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
  </div>
</template>
