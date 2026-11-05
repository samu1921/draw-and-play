/**
 * Certificate templates: fixed lines whose texts contain placeholders such as {name} or {platz}, filled in per
 * placement when printing. German and English placeholder names both work.
 */

export interface CertificateLines {
  top?: string;
  title?: string;
  name?: string;
  sub?: string;
  place?: string;
  text?: string;
  bottom?: string;
}

export interface CertificateTemplate {
  mode?: 'designed' | 'textOnly';
  showLogo?: boolean;
  backgroundId?: string | null;
  lines?: CertificateLines;
  signatures?: string[];
}

/** A template with every field set, as it is printed */
export interface ResolvedTemplate {
  mode: 'designed' | 'textOnly';
  showLogo: boolean;
  backgroundId: string | null;
  lines: Required<CertificateLines>;
  signatures: string[];
}

export const LINE_KEYS = ['top', 'title', 'name', 'sub', 'place', 'text', 'bottom'] as const;

/**
 * Built-in texts per language. Kept out of the i18n messages, where {placeholders} would be read as the
 * translation's own variables.
 */
const DEFAULT_LINES: Record<string, Required<CertificateLines>> = {
  de: { top: '{veranstaltung}', title: 'Urkunde', name: '{name}', sub: '{verein}', place: '{platz}. Platz', text: 'im Wettbewerb {konkurrenz}', bottom: '{datum}' },
  en: { top: '{event}', title: 'Certificate', name: '{name}', sub: '{club}', place: 'Place {place}', text: 'in the competition {competition}', bottom: '{date}' },
};

export const defaultLines = (locale: string): Required<CertificateLines> => DEFAULT_LINES[locale] ?? DEFAULT_LINES.en!;

export interface PlaceholderValues {
  name: string;
  club: string;
  place: string;
  competition: string;
  event: string;
  date: string;
}

/** Placeholder names, German first as shown in the editor; each maps to a value */
export const PLACEHOLDERS: Record<string, keyof PlaceholderValues> = {
  name: 'name',
  verein: 'club',
  club: 'club',
  platz: 'place',
  place: 'place',
  konkurrenz: 'competition',
  competition: 'competition',
  veranstaltung: 'event',
  event: 'event',
  datum: 'date',
  date: 'date',
};

/** Replaces {placeholders} (any case); unknown ones stay as typed, so a typo is visible on the preview */
export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(/\{([a-zäöü]+)\}/gi, (whole, name: string) => {
    const key = PLACEHOLDERS[name.toLowerCase()];
    return key ? values[key] : whole;
  });
}

/** The saved template on top of the built-in texts; an empty line stays empty (it is left out when printing) */
export function resolveTemplate(saved: CertificateTemplate | null | undefined, defaults: Required<CertificateLines>): ResolvedTemplate {
  const lines = { ...defaults };
  for (const key of LINE_KEYS) {
    const value = saved?.lines?.[key];
    if (value !== undefined) lines[key] = value;
  }
  return {
    mode: saved?.mode ?? 'designed',
    showLogo: saved?.showLogo ?? true,
    backgroundId: saved?.backgroundId ?? null,
    lines,
    signatures: saved?.signatures ?? [],
  };
}
