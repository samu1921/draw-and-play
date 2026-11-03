<script setup lang="ts">
import type { PlacementMode } from '@draw-and-play/domain';
import { useI18n } from 'vue-i18n';
import { describeFormat, describePlacements } from '../../lib/describe.js';
import { MAX_COMPETITIONS, variantsFor, type CompetitionDraft } from '../../lib/planDraft.js';
import { usePlannerStore } from '../../stores/planner.js';

const { t } = useI18n();
const store = usePlannerStore();

const scoringOptions = [1, 2, 3, 4];
const placementModes: PlacementMode[] = ['none', 'thirdPlace', 'all'];

const earlier = (c: CompetitionDraft) => store.draft.competitions.slice(0, store.draft.competitions.indexOf(c));
const hasKnockout = (c: CompetitionDraft) => variantsFor(c).find((v) => v.id === c.variantId)?.format.knockout !== undefined;

function onScoring(c: CompetitionDraft, event: Event) {
  store.setGamesToWin(c, Number((event.target as HTMLSelectElement).value));
}
</script>

<template>
  <section class="card" aria-labelledby="competitions-title">
    <div class="card-header">
      <h2 id="competitions-title">{{ t('planner.competitions.title') }}</h2>
      <button type="button" class="button" :disabled="!store.canAdd" @click="store.addCompetition()">
        {{ t('planner.competitions.add') }}
      </button>
    </div>
    <p v-if="!store.canAdd" class="muted">{{ t('planner.competitions.max', { n: MAX_COMPETITIONS }) }}</p>

    <fieldset
      v-for="c in store.draft.competitions"
      :key="c.id"
      class="competition"
      :class="{ selected: c.id === store.selectedId }"
    >
      <legend class="visually-hidden">{{ c.name }}</legend>
      <div class="competition-head">
        <span class="swatch" :style="{ background: `var(--series-${c.color + 1})` }" aria-hidden="true"></span>
        <label class="field grow">
          <span class="visually-hidden">{{ t('planner.competitions.name') }}</span>
          <input v-model="c.name" type="text" class="name-input" maxlength="40" />
        </label>
        <button
          type="button"
          class="button secondary"
          :aria-pressed="c.id === store.selectedId"
          @click="store.selectedId = c.id"
        >
          {{ t('planner.competitions.compare') }}
        </button>
        <button
          type="button"
          class="button icon"
          :aria-label="t('planner.competitions.remove', { name: c.name })"
          :title="t('planner.competitions.remove', { name: c.name })"
          @click="store.removeCompetition(c.id)"
        >
          ×
        </button>
      </div>

      <div class="fields">
        <label class="field">
          <span>{{ t('planner.competitions.entries') }}</span>
          <input v-model.number="c.entryCount" type="number" min="1" max="128" inputmode="numeric" />
        </label>
        <label class="field">
          <span>{{ t('planner.competitions.bestOf') }}</span>
          <select :value="c.gamesToWin" @change="onScoring(c, $event)">
            <option v-for="n in scoringOptions" :key="n" :value="n">
              {{ t('planner.competitions.bestOfOption', { n: 2 * n - 1 }) }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('planner.competitions.matchMinutes') }}</span>
          <input v-model.number="c.matchMinutes" type="number" min="5" max="240" step="5" inputmode="numeric" />
        </label>
        <label class="field wide">
          <span>{{ t('planner.competitions.format') }}</span>
          <select v-if="variantsFor(c).length > 0" v-model="c.variantId">
            <option v-for="v in variantsFor(c)" :key="v.id" :value="v.id">
              {{ describeFormat(t, v.format, c.entryCount) }}
            </option>
          </select>
          <span v-else class="warning-text">{{ t('planner.competitions.noFormat') }}</span>
        </label>
        <label v-if="hasKnockout(c)" class="field">
          <span>{{ t('planner.competitions.placements') }}</span>
          <select v-model="c.placements">
            <option v-for="mode in placementModes" :key="mode" :value="mode">{{ describePlacements(t, mode) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('planner.competitions.earliestStart') }}</span>
          <input v-model="c.earliestStart" type="time" step="300" />
        </label>
        <label class="field">
          <span>{{ t('planner.competitions.startAfter') }}</span>
          <select v-model="c.startAfter">
            <option value="">{{ t('planner.competitions.none') }}</option>
            <option v-for="other in earlier(c)" :key="other.id" :value="other.id">{{ other.name }}</option>
          </select>
        </label>
        <div class="field">
          <span>{{ t('planner.competitions.tables') }}</span>
          <div class="range">
            <input
              v-model.number="c.tableFrom"
              type="number"
              min="1"
              :max="store.draft.day.tableCount"
              :placeholder="'1'"
              :aria-label="t('planner.competitions.tablesFrom')"
              inputmode="numeric"
            />
            <span aria-hidden="true">–</span>
            <input
              v-model.number="c.tableTo"
              type="number"
              min="1"
              :max="store.draft.day.tableCount"
              :placeholder="String(store.draft.day.tableCount)"
              :aria-label="t('planner.competitions.tablesTo')"
              inputmode="numeric"
            />
          </div>
        </div>
      </div>
    </fieldset>
  </section>
</template>
