import { describe, expect, it } from 'vitest';
import { nextThemePreference } from './theme.js';

describe('nextThemePreference', () => {
  it('cycles through system, light and dark', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });
});
