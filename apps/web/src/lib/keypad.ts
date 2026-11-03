export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'minus' | 'next' | 'back';

/**
 * Applies a keypad press to the short notation: digits append, "minus" toggles the sign of the current game
 * ("4" ⇄ "-4"), "next" starts the next game, "back" deletes the last character.
 */
export function applyKey(value: string, key: KeypadKey): string {
  if (/^\d$/.test(key)) return value + key;
  if (key === 'next') return value.trim() === '' ? '' : `${value.trimEnd()} `;
  if (key === 'back') return value.trimEnd().slice(0, -1);
  // A trailing space means a new game has started, so its (still empty) token gets the sign.
  const start = value.lastIndexOf(' ') + 1;
  const head = value.slice(0, start);
  const current = value.slice(start).trim();
  return head + (current.startsWith('-') ? current.slice(1) : `-${current}`);
}
