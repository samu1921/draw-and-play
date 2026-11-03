<script setup lang="ts">
import { DOMAIN_VERSION } from '@draw-and-play/domain';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface Health {
  status: string;
  db: string;
  domainVersion: string;
}

const { t } = useI18n();
const health = ref<Health | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    health.value = (await res.json()) as Health;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <section>
    <h1>{{ t('app.tagline') }}</h1>
    <p>{{ t('home.scaffoldRunning') }} {{ t('home.domainInBrowser', { version: DOMAIN_VERSION }) }}</p>
    <dl class="status">
      <dt>{{ t('status.server') }}</dt>
      <dd v-if="health">{{ t('status.serverOk', { status: health.status, version: health.domainVersion }) }}</dd>
      <dd v-else-if="error">{{ t('status.unreachable', { error }) }}</dd>
      <dd v-else>{{ t('status.checking') }}</dd>
      <dt>{{ t('status.database') }}</dt>
      <dd>{{ health?.db ?? '–' }}</dd>
    </dl>
  </section>
</template>
