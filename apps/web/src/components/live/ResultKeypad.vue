<script setup lang="ts">
import type { MatchRules, SportProfile } from '@draw-and-play/domain';
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { applyKey, type KeypadKey } from '../../lib/keypad.js';
import { resultErrorText } from '../../lib/messages.js';

const props = defineProps<{
  modelValue: string;
  rules: MatchRules;
  sport: SportProfile;
  /** Names of the left and right side */
  sides: [string, string];
  /** Show the on-screen keypad and suppress the phone keyboard */
  keypad?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();
const hintId = useId();

const parsed = computed(() => (props.modelValue.trim() ? props.sport.parseResult(props.modelValue, props.rules) : null));

function set(value: string) {
  emit('update:modelValue', value);
}

function press(key: KeypadKey) {
  set(applyKey(props.modelValue, key));
}

const keys: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'minus', '0', 'back'];
</script>

<template>
  <div class="result-entry">
    <label class="field">
      <span>{{ t('result.label') }}</span>
      <input
        class="result-input"
        :value="modelValue"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :inputmode="keypad ? 'none' : 'text'"
        :aria-describedby="hintId"
        placeholder="4 -5 9 7"
        @input="set(($event.target as HTMLInputElement).value)"
      />
    </label>
    <p :id="hintId" class="muted small">{{ t('result.hint') }}</p>

    <div v-if="parsed?.ok" class="games" aria-live="polite">
      <ol class="game-list">
        <li v-for="(game, i) in parsed.games" :key="i" :class="game[0] > game[1] ? 'left' : 'right'">
          <span class="game-score">{{ game[0] }}:{{ game[1] }}</span>
        </li>
      </ol>
      <p v-if="parsed.outcome.status === 'finished'" class="outcome done">
        ✓ {{ t('result.finished', { name: sides[parsed.outcome.winner], a: parsed.outcome.games[0], b: parsed.outcome.games[1] }) }}
      </p>
      <p v-else class="outcome">{{ t('result.inProgress', { a: parsed.outcome.games[0], b: parsed.outcome.games[1] }) }}</p>
    </div>
    <p v-else-if="parsed" class="warning-text" role="status">{{ resultErrorText(t, parsed.error) }}</p>

    <div v-if="keypad" class="keypad">
      <button
        v-for="key in keys"
        :key="key"
        type="button"
        class="key"
        :aria-label="key === 'minus' ? t('result.keypad.minus') : key === 'back' ? t('result.keypad.backspace') : undefined"
        @click="press(key)"
      >
        {{ key === 'minus' ? '−' : key === 'back' ? '⌫' : key }}
      </button>
      <button type="button" class="key wide" @click="press('next')">{{ t('result.keypad.nextGame') }} ␣</button>
    </div>
  </div>
</template>
