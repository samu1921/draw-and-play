<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ imprintUrl: string | null; privacyUrl: string | null; note?: string | null }>();
const { t } = useI18n();
</script>

<template>
  <footer v-if="imprintUrl || privacyUrl || note" class="legal-footer">
    <p v-if="note" class="legal-note">{{ note }}</p>
    <nav v-if="imprintUrl || privacyUrl" :aria-label="t('legal.label')">
      <a v-if="imprintUrl" :href="imprintUrl" target="_blank" rel="noopener">{{ t('legal.imprint') }}</a>
      <a v-if="privacyUrl" :href="privacyUrl" target="_blank" rel="noopener">{{ t('legal.privacy') }}</a>
    </nav>
  </footer>
</template>
