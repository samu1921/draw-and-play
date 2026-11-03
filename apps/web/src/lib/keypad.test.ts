import { describe, expect, it } from 'vitest';
import { applyKey, type KeypadKey } from './keypad.js';

const type = (keys: KeypadKey[], start = '') => keys.reduce(applyKey, start);

describe('applyKey', () => {
  it('builds "4 -5 9 7" from key presses', () => {
    expect(type(['4', 'next', 'minus', '5', 'next', '9', 'next', '7'])).toBe('4 -5 9 7');
  });

  it('toggles the sign of the current game only', () => {
    expect(type(['minus'], '4 5')).toBe('4 -5');
    expect(type(['minus'], '4 -5')).toBe('4 5');
    expect(type(['1', '3', 'minus'])).toBe('-13');
  });

  it('does not start a game before the first one, nor twice', () => {
    expect(type(['next'])).toBe('');
    expect(type(['next', 'next'], '4')).toBe('4 ');
  });

  it('deletes the last character, skipping the trailing space', () => {
    expect(type(['back'], '4 -5 ')).toBe('4 -');
    expect(type(['back', 'back'], '12')).toBe('');
  });
});
