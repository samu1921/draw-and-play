<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectLiveEvent } from '../../composables/useLiveEvent.js';
import { api, type CompetitionInfo, type PersonInfo } from '../../lib/api.js';
import { decodeCsv, parseCsv } from '../../lib/csv.js';
import { errorText } from '../../lib/messages.js';
import {
  checkRows,
  guessMapping,
  IMPORT_FIELDS,
  toImportRequest,
  type ExistingMode,
  type ImportField,
  type RowError,
} from '../../lib/personImport.js';
import { toCsv } from '../../lib/printData.js';

const props = defineProps<{ eventId: string; slug: string; persons: PersonInfo[]; competitions: CompetitionInfo[] }>();
const emit = defineEmits<{ done: [] }>();
const { t, te, locale } = useI18n();
const live = injectLiveEvent();
const rating = computed(() => live.sport.value.ratingName);

const table = ref<string[][] | null>(null);
const mapping = ref<(ImportField | null)[]>([]);
const mode = ref<ExistingMode>('keep');
const present = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');

const fieldLabel = (field: ImportField) => t(`admin.import.fields.${field}`, { rating: rating.value });
const checks = computed(() => (table.value ? checkRows(table.value, mapping.value, props.competitions, props.persons) : []));
const counts = computed(() => ({
  new: checks.value.filter((c) => c.errors.length === 0 && !c.existing).length,
  existing: checks.value.filter((c) => c.errors.length === 0 && c.existing).length,
  errors: checks.value.filter((c) => c.errors.length > 0).length,
}));
const importable = computed(() => counts.value.new + counts.value.existing);
const hasFirstName = computed(() => mapping.value.includes('firstName'));
const competitionName = (id: string) => props.competitions.find((c) => c.id === id)?.name ?? '';
const errorLabel = (e: RowError) => t(`admin.import.errors.${e.code}`, 'value' in e ? { value: e.value } : 'line' in e ? { line: e.line } : {});

async function load(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  message.value = '';
  const rows = parseCsv(decodeCsv(await file.arrayBuffer()));
  if (rows.length < 2) {
    table.value = null;
    error.value = t('admin.import.noRows');
    return;
  }
  table.value = rows;
  mapping.value = guessMapping(rows[0]!, rating.value);
}

function setMapping(column: number, value: string) {
  const field = (value || null) as ImportField | null;
  // A field belongs to one column only
  mapping.value = mapping.value.map((f, i) => (i === column ? field : f === field ? null : f));
}

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const rows = toImportRequest(checks.value, mapping.value, mode.value);
    const report = await api<{ created: number; updated: number; entered: number; skipped: unknown[] }>(
      'POST',
      `/api/events/${props.eventId}/persons/import`,
      { rows, status: present.value ? 'present' : 'registered' },
      { timeoutMs: 60_000 },
    );
    message.value = [
      t('admin.import.done', { created: report.created, updated: report.updated, entered: report.entered }),
      report.skipped.length > 0 ? t('admin.import.skipped', { n: report.skipped.length }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    table.value = null;
    emit('done');
  } catch (e) {
    error.value = errorText(t, te, e);
  } finally {
    busy.value = false;
  }
}

function downloadTemplate() {
  const csv = toCsv([IMPORT_FIELDS.map(fieldLabel)], locale.value.startsWith('de') ? ';' : ',');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.slug}-players.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="card stack" aria-labelledby="import-persons">
    <h2 id="import-persons">{{ t('admin.import.title') }}</h2>
    <p class="muted">{{ t('admin.import.hint', { rating }) }}</p>
    <div class="button-row">
      <label class="field">
        <span>{{ t('admin.import.file') }}</span>
        <input type="file" accept=".csv,text/csv,text/plain" :disabled="busy" @change="load($event.target as HTMLInputElement)" />
      </label>
      <button type="button" class="button secondary" @click="downloadTemplate">{{ t('admin.import.template') }}</button>
    </div>

    <template v-if="table">
      <div class="table-scroll import-preview">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col" class="num">{{ t('admin.import.line') }}</th>
              <th scope="col">{{ t('admin.import.state') }}</th>
              <th v-for="(title, column) in table[0]" :key="column" scope="col">
                <span class="import-column-title">{{ title }}</span>
                <select :value="mapping[column] ?? ''" :aria-label="title" @change="setMapping(column, ($event.target as HTMLSelectElement).value)">
                  <option value="">{{ t('admin.import.ignore') }}</option>
                  <option v-for="field in IMPORT_FIELDS" :key="field" :value="field">{{ fieldLabel(field) }}</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(check, i) in checks" :key="check.line" :class="{ 'import-error': check.errors.length > 0 }">
              <td class="num">{{ check.line }}</td>
              <td>
                <template v-if="check.errors.length > 0">
                  <span class="warning-text">{{ check.errors.map(errorLabel).join(', ') }}</span>
                </template>
                <span v-else-if="check.existing" class="badge">{{ t('admin.import.states.existing') }}</span>
                <span v-else class="badge">{{ t('admin.import.states.new') }}</span>
              </td>
              <td v-for="(cell, column) in table[i + 1]" :key="column">
                <template v-if="mapping[column] === 'competitions'">{{ check.values.competitionIds.map(competitionName).join(', ') || cell }}</template>
                <template v-else>{{ cell }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="!hasFirstName" class="warning-text" role="alert">{{ t('admin.import.needFirstName') }}</p>
      <p v-else class="muted" role="status">{{ t('admin.import.summary', counts) }}</p>

      <div class="fields">
        <label v-if="counts.existing > 0" class="field">
          <span>{{ t('admin.import.existingMode') }}</span>
          <select v-model="mode">
            <option v-for="m in ['keep', 'update'] as const" :key="m" :value="m">{{ t(`admin.import.modes.${m}`) }}</option>
          </select>
        </label>
        <label v-if="mapping.includes('competitions')" class="check">
          <input v-model="present" type="checkbox" />
          {{ t('admin.import.present') }}
        </label>
      </div>
      <div class="button-row">
        <button type="button" class="button" :disabled="busy || !hasFirstName || importable === 0" @click="submit">
          {{ t('admin.import.submit', { n: importable }) }}
        </button>
        <button type="button" class="button secondary" :disabled="busy" @click="table = null">{{ t('common.cancel') }}</button>
      </div>
    </template>

    <p v-if="message" class="muted" role="status">{{ message }}</p>
    <p v-if="error" class="warning-text" role="alert">{{ error }}</p>
  </section>
</template>
