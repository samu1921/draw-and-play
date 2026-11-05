import { describe, expect, it } from 'vitest';
import { accentStyleSheet, contrast, deriveAccent, MIN_CONTRAST, parseHex } from './color.js';

describe('contrast', () => {
  it('follows WCAG: black on white is 21:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('parses only #rrggbb', () => {
    expect(parseHex('#1C5CAB')).toEqual([28, 92, 171]);
    expect(parseHex('red')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
  });
});

describe('deriveAccent', () => {
  it('keeps a dark brand colour in light mode and lightens it for dark mode', () => {
    const s = deriveAccent('#1c5cab')!;
    expect(s.light.accent).toBe('#1c5cab');
    expect(s.adjusted).toBe(false);
    expect(s.light.contrast).toBe('#ffffff');
    expect(contrast(s.dark.accent, '#1a1a19')).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('darkens a light brand colour until it reads on the light background', () => {
    const s = deriveAccent('#ffd600')!; // a bright club yellow
    expect(s.adjusted).toBe(true);
    expect(contrast(s.light.accent, '#f9f9f7')).toBeGreaterThanOrEqual(MIN_CONTRAST);
    // Yellow itself works as is on the dark background, with dark text on buttons
    expect(s.dark.accent).toBe('#ffd600');
    expect(s.dark.contrast).toBe('#0b0b0b');
  });

  it('is null for an invalid colour', () => {
    expect(deriveAccent('blue')).toBeNull();
    expect(accentStyleSheet('blue')).toBe('');
  });

  it('writes variables for light, dark by system and dark by choice', () => {
    const css = accentStyleSheet('#b01e2d');
    expect(css).toContain(':root { --accent: #b01e2d;');
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain(":root[data-theme='dark']");
  });
});
