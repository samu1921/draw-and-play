/**
 * Accent colours for a chosen brand colour. The brand colour is used as it is where it stays readable; otherwise
 * it is darkened (light mode) or lightened (dark mode) step by step until text in it reaches 4.5:1 (WCAG AA).
 */

type Rgb = [number, number, number];

const LIGHT_SURFACE = '#f9f9f7';
const DARK_SURFACE = '#1a1a19';
const WHITE = '#ffffff';
const INK = '#0b0b0b';
export const MIN_CONTRAST = 4.5;

export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** Relative luminance as defined by WCAG */
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(parseHex(a)!);
  const lb = luminance(parseHex(b)!);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return color.map((c, i) => c + (target[i]! - c) * amount) as Rgb;
}

/** The colour moved towards `target` in small steps until it reads on `surface` */
function readableOn(hex: string, surface: string, target: string): string {
  const rgb = parseHex(hex)!;
  const towards = parseHex(target)!;
  for (let step = 0; step <= 20; step++) {
    const candidate = toHex(mix(rgb, towards, step * 0.05));
    if (contrast(candidate, surface) >= MIN_CONTRAST) return candidate;
  }
  return target;
}

/** White or near-black text on a filled accent, whichever reads better */
const textOn = (accent: string) => (contrast(WHITE, accent) >= contrast(INK, accent) ? WHITE : INK);

export interface AccentScheme {
  accent: string;
  /** Text on a filled accent (buttons) */
  contrast: string;
  /** Faint tint for selected rows and active navigation */
  selected: string;
}

function tint(hex: string, alpha: number) {
  const [r, g, b] = parseHex(hex)!;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Accent colours for light and dark mode from one brand colour; null for an invalid colour */
export function deriveAccent(hex: string): { light: AccentScheme; dark: AccentScheme; adjusted: boolean } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const normal = toHex(rgb);
  const light = readableOn(normal, LIGHT_SURFACE, INK);
  const dark = readableOn(normal, DARK_SURFACE, WHITE);
  return {
    light: { accent: light, contrast: textOn(light), selected: tint(light, 0.08) },
    dark: { accent: dark, contrast: textOn(dark), selected: tint(dark, 0.16) },
    adjusted: light !== normal,
  };
}

/** A style sheet that puts the accent colours in place of the default blue, for both colour schemes */
export function accentStyleSheet(hex: string): string {
  const scheme = deriveAccent(hex);
  if (!scheme) return '';
  const vars = (s: AccentScheme) => `--accent: ${s.accent}; --accent-contrast: ${s.contrast}; --selected: ${s.selected};`;
  return [
    `:root { ${vars(scheme.light)} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ${vars(scheme.dark)} } }`,
    `:root[data-theme='dark'] { ${vars(scheme.dark)} }`,
  ].join('\n');
}
