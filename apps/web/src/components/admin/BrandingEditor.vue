<script setup lang="ts">
import { ImagePlus, Monitor, Palette, RotateCcw, Trash2, Type } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppLogo from '../AppLogo.vue';
import {
  ACCENT_PRESETS,
  assetUrl,
  DEFAULT_DISPLAY_DIM,
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  mergeBranding,
  uploadAsset,
  type AssetKind,
  type Branding,
} from '../../lib/branding.js';
import { deriveAccent } from '../../lib/color.js';
import { errorText } from '../../lib/messages.js';
import { APP_NAME } from '../../lib/pageTitle.js';

/**
 * Edits a look: name, accent colour, logo and display background. For an event (`eventId`), empty fields fall
 * back to the installation's look (`inherited`), which the placeholders and the preview show.
 */
const props = defineProps<{ modelValue: Branding; eventId?: string; inherited?: Branding }>();
const emit = defineEmits<{ 'update:modelValue': [value: Branding] }>();
const { t, te } = useI18n();

const DEFAULT_ACCENT = '#1c5cab';
const set = <K extends keyof Branding>(key: K, value: Branding[K]) => emit('update:modelValue', { ...props.modelValue, [key]: value });

/** What the pages will show: own values, else the installation's */
const effective = computed(() => mergeBranding(props.inherited ?? {}, props.modelValue));
const accent = computed(() => effective.value.accent || DEFAULT_ACCENT);
const scheme = computed(() => deriveAccent(accent.value));
const dim = computed(() => effective.value.displayDim ?? DEFAULT_DISPLAY_DIM);

const hexInput = ref('');
function onHex(value: string) {
  hexInput.value = value;
  if (/^#[0-9a-f]{6}$/i.test(value.trim())) set('accent', value.trim().toLowerCase());
}

const uploading = ref<AssetKind | null>(null);
const error = ref('');
async function upload(event: Event, kind: 'logo' | 'displayBackground') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  if (file.size > MAX_IMAGE_BYTES) {
    error.value = t('branding.tooLarge');
    return;
  }
  uploading.value = kind;
  try {
    const id = await uploadAsset(file, kind, props.eventId);
    set(kind === 'logo' ? 'logoId' : 'displayBackgroundId', id);
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    uploading.value = null;
  }
}

const previewVars = (mode: 'light' | 'dark') => {
  const s = scheme.value?.[mode];
  return s ? { '--accent': s.accent, '--accent-contrast': s.contrast, '--selected': s.selected } : {};
};
</script>

<template>
  <div class="branding-editor">
    <section class="card" aria-labelledby="branding-name">
      <h3 id="branding-name"><Type aria-hidden="true" />{{ t('branding.nameTitle') }}</h3>
      <label class="field">
        <span>{{ t('branding.name') }} ({{ t('common.optional') }})</span>
        <input
          type="text"
          maxlength="60"
          :value="modelValue.name ?? ''"
          :placeholder="inherited?.name || APP_NAME"
          @input="set('name', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <p class="muted small">{{ eventId ? t('branding.nameHintEvent') : t('branding.nameHint') }}</p>
    </section>

    <section class="card" aria-labelledby="branding-accent">
      <h3 id="branding-accent"><Palette aria-hidden="true" />{{ t('branding.accentTitle') }}</h3>
      <div class="swatch-picker" role="group" :aria-label="t('branding.presets')">
        <button
          v-for="color in ACCENT_PRESETS"
          :key="color"
          type="button"
          class="swatch-button"
          :style="{ background: color }"
          :aria-pressed="accent === color"
          :aria-label="color"
          :title="color"
          @click="set('accent', color)"
        ></button>
        <label class="swatch-custom" :title="t('branding.custom')">
          <input type="color" :value="accent" @input="set('accent', ($event.target as HTMLInputElement).value)" />
          <span class="visually-hidden">{{ t('branding.custom') }}</span>
        </label>
      </div>
      <div class="fields">
        <label class="field">
          <span>{{ t('branding.hex') }}</span>
          <input type="text" maxlength="7" :value="hexInput || accent" spellcheck="false" @input="onHex(($event.target as HTMLInputElement).value)" @blur="hexInput = ''" />
        </label>
        <div class="field form-actions">
          <button v-if="modelValue.accent" type="button" class="button secondary" @click="set('accent', null)">
            <RotateCcw aria-hidden="true" />{{ eventId ? t('branding.useInstallation') : t('branding.default') }}
          </button>
        </div>
      </div>
      <p v-if="scheme?.adjusted" class="muted small">{{ t('branding.adjusted') }}</p>

      <div class="brand-previews">
        <div v-for="mode in ['light', 'dark'] as const" :key="mode" class="brand-preview" :class="mode" :style="previewVars(mode)">
          <div class="brand-preview-head">
            <img v-if="effective.logoId" :src="assetUrl(effective.logoId)" alt="" class="brand-logo" />
            <AppLogo v-else :size="24" />
            <strong>{{ effective.name || APP_NAME }}</strong>
          </div>
          <div class="brand-preview-body">
            <span class="brand-preview-tab">{{ t('admin.tabs.desk') }}</span>
            <a href="#" class="brand-preview-link" @click.prevent>{{ t('admin.setup.publicView') }}</a>
            <span class="button small">{{ t('admin.desk.call') }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="card" aria-labelledby="branding-logo">
      <h3 id="branding-logo"><ImagePlus aria-hidden="true" />{{ t('branding.logoTitle') }}</h3>
      <div class="image-field">
        <div class="logo-preview">
          <img v-if="effective.logoId" :src="assetUrl(effective.logoId)" alt="" />
          <AppLogo v-else :size="56" />
        </div>
        <div class="stack">
          <p class="muted small">{{ t('branding.logoHint') }}</p>
          <div class="button-row">
            <label class="button secondary file-button">
              <ImagePlus aria-hidden="true" />{{ uploading === 'logo' ? t('common.loading') : t('branding.upload') }}
              <input type="file" :accept="IMAGE_ACCEPT" :disabled="uploading !== null" @change="upload($event, 'logo')" />
            </label>
            <button v-if="modelValue.logoId" type="button" class="button secondary" @click="set('logoId', null)">
              <Trash2 aria-hidden="true" />{{ eventId ? t('branding.useInstallation') : t('branding.remove') }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="card" aria-labelledby="branding-display">
      <h3 id="branding-display"><Monitor aria-hidden="true" />{{ t('branding.displayTitle') }}</h3>
      <div class="display-preview" :class="{ 'has-bg': effective.displayBackgroundId }">
        <div v-if="effective.displayBackgroundId" class="stage-bg" :style="{ backgroundImage: `url(${assetUrl(effective.displayBackgroundId)})` }"></div>
        <div v-if="effective.displayBackgroundId" class="stage-dim" :style="{ opacity: dim / 100 }"></div>
        <div class="display-preview-content">
          <div class="display-preview-head">
            <img v-if="effective.logoId" :src="assetUrl(effective.logoId)" alt="" />
            <span>{{ t('branding.sampleEvent') }}</span>
            <span class="display-preview-clock">14:05</span>
          </div>
          <div class="display-preview-cards">
            <div v-for="n in 3" :key="n" class="display-preview-card">
              <strong>{{ t('table.title', { name: n }) }}</strong>
              <span>Anna Berger – Ben Krüger</span>
            </div>
          </div>
        </div>
      </div>
      <p class="muted small">{{ t('branding.displayHint') }}</p>
      <div class="button-row">
        <label class="button secondary file-button">
          <ImagePlus aria-hidden="true" />{{ uploading === 'displayBackground' ? t('common.loading') : t('branding.uploadBackground') }}
          <input type="file" :accept="IMAGE_ACCEPT" :disabled="uploading !== null" @change="upload($event, 'displayBackground')" />
        </label>
        <button v-if="modelValue.displayBackgroundId" type="button" class="button secondary" @click="set('displayBackgroundId', null)">
          <Trash2 aria-hidden="true" />{{ eventId ? t('branding.useInstallation') : t('branding.remove') }}
        </button>
      </div>
      <label v-if="effective.displayBackgroundId" class="field">
        <span>{{ t('branding.dim', { n: dim }) }}</span>
        <input type="range" min="0" max="90" step="5" :value="dim" @input="set('displayDim', Number(($event.target as HTMLInputElement).value))" />
      </label>
    </section>

    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </div>
</template>
