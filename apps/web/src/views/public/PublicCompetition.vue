<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import CompetitionStateView from '../../components/live/CompetitionStateView.vue';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type CompetitionStateInfo } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';

const { t, te } = useI18n();
const route = useRoute();
const live = injectLiveEvent();
const competitionId = computed(() => route.params.competitionId as string);
const state = ref<CompetitionStateInfo | null>(null);
const error = ref('');

async function load() {
  try {
    state.value = await api<CompetitionStateInfo>('GET', `/api/competitions/${competitionId.value}/state`);
    error.value = '';
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
watch(competitionId, load, { immediate: true });
live.onChange(load);
const tableName = (id: string) => live.overview.value?.tables.find((t) => t.id === id)?.name;
</script>

<template>
  <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  <section v-if="state" class="card">
    <h2>{{ state.competition.name }}</h2>
    <CompetitionStateView :state="state" :table-name="tableName" />
  </section>
</template>
