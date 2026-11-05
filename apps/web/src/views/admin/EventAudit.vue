<script setup lang="ts">
import { ScrollText } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/messages.js';

interface AuditEntry {
  id: number;
  createdAt: string;
  actor: { type: 'user' | 'device' | 'other'; name: string | null };
  action: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown> | null;
}

const { t, te, locale } = useI18n();
const live = injectLiveEvent();
const eventId = computed(() => live.overview.value!.event.id);
const entries = ref<AuditEntry[]>([]);
const next = ref<number | null>(null);
const loaded = ref(false);
const error = ref('');

async function load(more = false) {
  error.value = '';
  try {
    const query = more && next.value ? `&before=${next.value}` : '';
    const page = await api<{ entries: AuditEntry[]; next: number | null }>('GET', `/api/events/${eventId.value}/audit?limit=100${query}`);
    entries.value = more ? [...entries.value, ...page.entries] : page.entries;
    next.value = page.next;
    loaded.value = true;
  } catch (e) {
    error.value = errorText(t, te, e);
  }
}
onMounted(() => load());
live.onChange(() => void load());

const actionText = (action: string) => (te(`audit.actions.${action}`) ? t(`audit.actions.${action}`) : action);
const actorText = (e: AuditEntry) => {
  if (e.actor.type === 'user') return e.actor.name ?? t('audit.unknownUser');
  if (e.actor.type === 'device') return e.actor.name ? t('audit.deviceNamed', { name: e.actor.name }) : t('audit.device');
  return e.actor.name ?? '';
};
/** A short detail where the entry has one: result, seed, counts */
function detail(e: AuditEntry): string {
  const data = e.data ?? {};
  const result = data.result as { winner: number; games: [number, number][]; walkover?: boolean } | undefined;
  if (result) return result.walkover ? t('public.walkover') : result.games.map(([a, b]) => `${a}:${b}`).join(', ');
  if (typeof data.seed === 'string') return `Seed ${data.seed}`;
  if (typeof data.tableId === 'string') {
    const table = live.overview.value?.tables.find((x) => x.id === data.tableId);
    if (table) return t('table.title', { name: table.name });
  }
  if (typeof data.walkovers === 'number') return t('audit.walkovers', data.walkovers, { named: { n: data.walkovers } });
  if (typeof data.created === 'number') return t('audit.imported', { created: data.created, updated: data.updated ?? 0, entered: data.entered ?? 0 });
  return '';
}
</script>

<template>
  <section class="card" aria-labelledby="audit-title">
    <h2 id="audit-title"><ScrollText aria-hidden="true" />{{ t('audit.title') }}</h2>
    <p class="muted small">{{ t('audit.hint') }}</p>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
    <p v-else-if="loaded && entries.length === 0" class="muted">{{ t('audit.empty') }}</p>
    <div v-else class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">{{ t('audit.when') }}</th>
            <th scope="col">{{ t('audit.who') }}</th>
            <th scope="col">{{ t('audit.what') }}</th>
            <th scope="col">{{ t('audit.detail') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="nowrap">{{ new Date(e.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' }) }}</td>
            <td>{{ actorText(e) }}</td>
            <td>{{ actionText(e.action) }}</td>
            <td class="muted">{{ detail(e) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="next"><button type="button" class="button secondary small" @click="load(true)">{{ t('audit.more') }}</button></div>
  </section>
</template>
