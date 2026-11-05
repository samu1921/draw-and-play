<script setup lang="ts">
import { Award, ImagePlus, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CertificateSheet from '../print/CertificateSheet.vue';
import { assetUrl, IMAGE_ACCEPT, MAX_IMAGE_BYTES, uploadAsset } from '../../lib/branding.js';
import { defaultLines, fillPlaceholders, LINE_KEYS, resolveTemplate, type CertificateLines, type CertificateTemplate } from '../../lib/certificate.js';
import { errorText } from '../../lib/messages.js';

/**
 * Edits a certificate template: texts with placeholders, signature captions, logo, background image and the
 * text-only mode for pre-printed paper. The preview fills the placeholders with sample values.
 */
const props = defineProps<{ modelValue: CertificateTemplate; eventId?: string; logoId?: string | null; eventName?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: CertificateTemplate] }>();
const { t, te, d, locale } = useI18n();

const defaults = computed(() => defaultLines(locale.value));
const resolved = computed(() => resolveTemplate(props.modelValue, defaults.value));
const set = (patch: Partial<CertificateTemplate>) => emit('update:modelValue', { ...props.modelValue, ...patch });
const setLine = (key: keyof CertificateLines, value: string) => set({ lines: { ...resolved.value.lines, [key]: value } });
function setSignature(i: number, value: string) {
  const next = [...resolved.value.signatures];
  next[i] = value;
  set({ signatures: next.slice(0, 2).map((s) => s ?? '') });
}

const sample = computed(() => ({
  name: 'Anna Berger',
  club: 'TTC Nord',
  place: '1',
  competition: t('certificate.sampleCompetition'),
  event: props.eventName || t('branding.sampleEvent'),
  date: d(new Date()),
}));
const previewLines = computed(
  () => Object.fromEntries(LINE_KEYS.map((key) => [key, fillPlaceholders(resolved.value.lines[key], sample.value).trim()])) as Required<CertificateLines>,
);

const PLACEHOLDER_NAMES = ['name', 'verein', 'platz', 'konkurrenz', 'veranstaltung', 'datum'];
const placeholder = (name: string) => `{${name}}`;

const uploading = ref(false);
const error = ref('');
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  if (file.size > MAX_IMAGE_BYTES) {
    error.value = t('branding.tooLarge');
    return;
  }
  uploading.value = true;
  try {
    set({ backgroundId: await uploadAsset(file, 'certificateBackground', props.eventId) });
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div class="certificate-editor">
    <div class="stack">
      <div class="segmented" role="group" :aria-label="t('certificate.mode')">
        <button type="button" :aria-pressed="resolved.mode === 'designed'" @click="set({ mode: 'designed' })">{{ t('certificate.designed') }}</button>
        <button type="button" :aria-pressed="resolved.mode === 'textOnly'" @click="set({ mode: 'textOnly' })">{{ t('certificate.textOnly') }}</button>
      </div>
      <p class="muted small">{{ resolved.mode === 'textOnly' ? t('certificate.textOnlyHint') : t('certificate.designedHint') }}</p>

      <template v-if="resolved.mode === 'designed'">
        <label class="check">
          <input type="checkbox" :checked="resolved.showLogo" @change="set({ showLogo: ($event.target as HTMLInputElement).checked })" />
          {{ t('certificate.showLogo') }}
        </label>
        <p v-if="resolved.showLogo && !logoId" class="muted small">{{ t('certificate.noLogo') }}</p>
        <div class="button-row">
          <label class="button secondary file-button">
            <ImagePlus aria-hidden="true" />{{ uploading ? t('common.loading') : t('certificate.uploadBackground') }}
            <input type="file" :accept="IMAGE_ACCEPT" :disabled="uploading" @change="upload" />
          </label>
          <button v-if="resolved.backgroundId" type="button" class="button secondary" @click="set({ backgroundId: null })">
            <Trash2 aria-hidden="true" />{{ t('branding.remove') }}
          </button>
        </div>
        <p class="muted small">{{ t('certificate.backgroundHint') }}</p>
      </template>

      <fieldset class="plain-fieldset fields">
        <legend>{{ t('certificate.texts') }}</legend>
        <label v-for="key in LINE_KEYS" :key="key" class="field wide">
          <span>{{ t(`certificate.lines.${key}`) }}</span>
          <input type="text" maxlength="200" :value="resolved.lines[key]" @input="setLine(key, ($event.target as HTMLInputElement).value)" />
        </label>
        <label v-for="i in [0, 1]" :key="`s${i}`" class="field">
          <span>{{ t('certificate.signature', { n: i + 1 }) }} ({{ t('common.optional') }})</span>
          <input type="text" maxlength="60" :value="resolved.signatures[i] ?? ''" :placeholder="t('certificate.signatureExample')" @input="setSignature(i, ($event.target as HTMLInputElement).value)" />
        </label>
      </fieldset>
      <p class="muted small">
        {{ t('certificate.placeholders') }}
        <code v-for="name in PLACEHOLDER_NAMES" :key="name" class="placeholder-chip" v-text="placeholder(name)"></code>
      </p>
      <p class="muted small">{{ t('certificate.emptyLine') }}</p>
      <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    </div>

    <figure class="certificate-preview">
      <figcaption class="muted small"><Award aria-hidden="true" />{{ t('certificate.preview') }}</figcaption>
      <CertificateSheet
        :lines="previewLines"
        :signatures="resolved.signatures"
        :mode="resolved.mode"
        :logo-url="resolved.showLogo && logoId ? assetUrl(logoId) : null"
        :background-url="resolved.backgroundId ? assetUrl(resolved.backgroundId) : null"
      />
    </figure>
  </div>
</template>
