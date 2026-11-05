import type { PersonInfo } from './api.js';

/**
 * Player import from a CSV file: which column holds what, checking each row, and finding players that exist
 * already. Pure functions; the component only shows the result.
 */

export const IMPORT_FIELDS = ['firstName', 'lastName', 'club', 'gender', 'birthYear', 'licenceNo', 'rating', 'competitions'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Column header → field, compared after `normalizeHeader` (German and English, common spellings) */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  firstName: ['vorname', 'firstname', 'givenname', 'first'],
  lastName: ['nachname', 'lastname', 'familienname', 'surname', 'last'],
  club: ['verein', 'club', 'team'],
  gender: ['geschlecht', 'gender', 'sex'],
  birthYear: ['jahrgang', 'geburtsjahr', 'birthyear', 'born', 'yearofbirth', 'geburtsdatum', 'birthdate', 'dateofbirth'],
  licenceNo: ['lizenznr', 'lizenznummer', 'lizenz', 'licenceno', 'licencenumber', 'licence', 'licenseno', 'licensenumber', 'license', 'spielerid', 'passnummer'],
  rating: ['rating', 'qttr', 'ttr', 'wertung', 'elo'],
  competitions: ['konkurrenzen', 'konkurrenz', 'wettbewerbe', 'wettbewerb', 'competitions', 'competition', 'events'],
};

/** Lower case, umlauts spelled out, only letters and digits: "Lizenz-Nr." → "lizenznr" */
export function normalizeHeader(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/** The field each column most likely holds; every field is used at most once, unknown columns are ignored (null) */
export function guessMapping(header: readonly string[], ratingName?: string): (ImportField | null)[] {
  const used = new Set<ImportField>();
  const rating = ratingName ? normalizeHeader(ratingName) : null;
  return header.map((title) => {
    const key = normalizeHeader(title);
    const field = IMPORT_FIELDS.find((f) => !used.has(f) && (HEADER_ALIASES[f].includes(key) || (f === 'rating' && key === rating)));
    if (field) used.add(field);
    return field ?? null;
  });
}

export type RowError =
  | { code: 'missingFirstName' }
  | { code: 'invalidGender' | 'invalidYear' | 'invalidRating' | 'unknownCompetition'; value: string }
  | { code: 'duplicateInFile'; line: number };

export interface ImportValues {
  firstName: string;
  lastName: string | null;
  club: string | null;
  gender: 'f' | 'm' | 'd' | null;
  birthYear: number | null;
  licenceNo: string | null;
  rating: number | null;
  competitionIds: string[];
}

export interface ImportRowCheck {
  /** Line in the file (1 = header) */
  line: number;
  values: ImportValues;
  errors: RowError[];
  /** The person this row stands for, if the event has them already */
  existing: PersonInfo | null;
}

/** f/w/weiblich/female, m/männlich/male, d/divers; empty = not given; anything else is invalid (undefined) */
export function parseGender(text: string): 'f' | 'm' | 'd' | null | undefined {
  if (text.trim() === '') return null;
  const key = normalizeHeader(text);
  if (['f', 'w', 'weiblich', 'female', 'frau', 'woman', 'damen'].includes(key)) return 'f';
  if (['m', 'maennlich', 'male', 'mann', 'man', 'herren'].includes(key)) return 'm';
  if (['d', 'divers', 'diverse', 'x'].includes(key)) return 'd';
  return undefined;
}

/** "2001", "17.03.2001" or "2001-03-17" → 2001; empty = not given; anything else is invalid (undefined) */
export function parseBirthYear(text: string): number | null | undefined {
  const value = text.trim();
  if (value === '') return null;
  const match = /^(\d{4})$/.exec(value) ?? /^\d{1,2}\.\d{1,2}\.(\d{4})$/.exec(value) ?? /^(\d{4})-\d{1,2}-\d{1,2}$/.exec(value);
  const year = match ? Number(match[1]) : NaN;
  return year >= 1900 && year <= 2100 ? year : undefined;
}

/** Whole number 0–4000, also with a thousands dot ("1.520"); empty = not given; else invalid (undefined) */
export function parseRating(text: string): number | null | undefined {
  const value = text.trim().replace(/^(\d{1,2})[.'](\d{3})$/, '$1$2');
  if (value === '') return null;
  if (!/^\d{1,4}$/.test(value)) return undefined;
  const rating = Number(value);
  return rating <= 4000 ? rating : undefined;
}

const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLocaleLowerCase() === (b ?? '').trim().toLocaleLowerCase();

/** Same licence number, or same first and last name (and the same birth year where both have one) */
export function findExisting(values: ImportValues, persons: readonly PersonInfo[]): PersonInfo | null {
  if (values.licenceNo) {
    const byLicence = persons.find((p) => p.licenceNo && sameText(p.licenceNo, values.licenceNo));
    if (byLicence) return byLicence;
  }
  return (
    persons.find(
      (p) =>
        sameText(p.firstName, values.firstName) &&
        sameText(p.lastName, values.lastName) &&
        (p.birthYear == null || values.birthYear === null || p.birthYear === values.birthYear),
    ) ?? null
  );
}

/** Checks every data row (the first row is the header) against the mapping, the competitions and the existing players */
export function checkRows(
  table: readonly (readonly string[])[],
  mapping: readonly (ImportField | null)[],
  competitions: readonly { id: string; name: string }[],
  persons: readonly PersonInfo[],
): ImportRowCheck[] {
  const column = (field: ImportField) => mapping.indexOf(field);
  const cell = (row: readonly string[], field: ImportField) => (column(field) >= 0 ? (row[column(field)] ?? '').trim() : '');
  const competitionByName = new Map(competitions.map((c) => [c.name.trim().toLocaleLowerCase(), c.id]));

  const checks = table.slice(1).map((row, i): ImportRowCheck => {
    const errors: RowError[] = [];
    const firstName = cell(row, 'firstName');
    if (!firstName) errors.push({ code: 'missingFirstName' });
    const gender = parseGender(cell(row, 'gender'));
    if (gender === undefined) errors.push({ code: 'invalidGender', value: cell(row, 'gender') });
    const birthYear = parseBirthYear(cell(row, 'birthYear'));
    if (birthYear === undefined) errors.push({ code: 'invalidYear', value: cell(row, 'birthYear') });
    const rating = parseRating(cell(row, 'rating'));
    if (rating === undefined) errors.push({ code: 'invalidRating', value: cell(row, 'rating') });
    const competitionIds: string[] = [];
    for (const name of cell(row, 'competitions').split(/[,|\n]/).map((n) => n.trim()).filter(Boolean)) {
      const id = competitionByName.get(name.toLocaleLowerCase());
      if (id) {
        if (!competitionIds.includes(id)) competitionIds.push(id);
      } else errors.push({ code: 'unknownCompetition', value: name });
    }
    const values: ImportValues = {
      firstName,
      lastName: cell(row, 'lastName') || null,
      club: cell(row, 'club') || null,
      gender: gender ?? null,
      birthYear: birthYear ?? null,
      licenceNo: cell(row, 'licenceNo') || null,
      rating: rating ?? null,
      competitionIds,
    };
    return { line: i + 2, values, errors, existing: firstName ? findExisting(values, persons) : null };
  });

  // The same player twice in the file would end up as one person entered twice
  checks.forEach((check, i) => {
    if (!check.values.firstName) return;
    const earlier = checks.slice(0, i).find((other) => other.values.firstName && findExisting(check.values, [asPerson(other.values)]));
    if (earlier) check.errors.push({ code: 'duplicateInFile', line: earlier.line });
  });
  return checks;
}

function asPerson(values: ImportValues): PersonInfo {
  return { id: '', name: values.firstName, club: values.club, firstName: values.firstName, lastName: values.lastName, birthYear: values.birthYear, licenceNo: values.licenceNo };
}

/** keep: players who exist keep their data (they are only entered); update: their data is overwritten by the file */
export type ExistingMode = 'keep' | 'update';

export interface ImportRequestRow {
  firstName: string;
  lastName?: string | null;
  club?: string | null;
  gender?: 'f' | 'm' | 'd' | null;
  birthYear?: number | null;
  licenceNo?: string | null;
  rating?: number | null;
  updateId?: string;
  competitionIds: string[];
}

/**
 * Rows for the API, without the rows that have errors. New players get every mapped column; existing ones are
 * referenced by id and, when updating, get only the filled cells of mapped columns, so an empty cell never wipes data.
 */
export function toImportRequest(checks: readonly ImportRowCheck[], mapping: readonly (ImportField | null)[], mode: ExistingMode): ImportRequestRow[] {
  const mapped = new Set(mapping.filter((f): f is ImportField => f !== null));
  const personFields = ['lastName', 'club', 'gender', 'birthYear', 'licenceNo', 'rating'] as const;
  return checks
    .filter((c) => c.errors.length === 0)
    .map((c) => {
      if (c.existing) {
        const row: ImportRequestRow = { updateId: c.existing.id, firstName: c.existing.firstName ?? c.values.firstName, competitionIds: c.values.competitionIds };
        if (mode === 'update') {
          row.firstName = c.values.firstName;
          for (const field of personFields) if (mapped.has(field) && c.values[field] !== null) Object.assign(row, { [field]: c.values[field] });
        }
        return row;
      }
      const row: ImportRequestRow = { firstName: c.values.firstName, competitionIds: c.values.competitionIds };
      for (const field of personFields) if (mapped.has(field)) Object.assign(row, { [field]: c.values[field] });
      return row;
    });
}
