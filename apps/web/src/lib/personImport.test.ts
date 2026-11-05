import { describe, expect, it } from 'vitest';
import type { PersonInfo } from './api.js';
import { parseCsv } from './csv.js';
import { checkRows, findExisting, guessMapping, parseBirthYear, parseGender, parseRating, toImportRequest, type ImportValues } from './personImport.js';

const competitions = [
  { id: 'c-singles', name: 'Einzel Aktive' },
  { id: 'c-doubles', name: 'Doppel' },
];
const existing: PersonInfo[] = [
  { id: 'p-anna', name: 'Anna Berger', club: 'TTC', firstName: 'Anna', lastName: 'Berger', birthYear: 2001, licenceNo: null, rating: 1700 },
  { id: 'p-lic', name: 'Ben Krüger', club: 'SV', firstName: 'Ben', lastName: 'Krüger', birthYear: null, licenceNo: 'L-7', rating: null },
];

describe('guessMapping', () => {
  it('recognises German and English headers and leaves unknown columns out', () => {
    expect(guessMapping(['Vorname', 'Nachname', 'Verein', 'Geschlecht', 'Jahrgang', 'Lizenz-Nr.', 'QTTR', 'Konkurrenzen', 'Bemerkung'])).toEqual([
      'firstName', 'lastName', 'club', 'gender', 'birthYear', 'licenceNo', 'rating', 'competitions', null,
    ]);
    expect(guessMapping(['First name', 'Last name', 'Club', 'Date of birth', 'Rating', 'Competitions'])).toEqual([
      'firstName', 'lastName', 'club', 'birthYear', 'rating', 'competitions',
    ]);
  });

  it('uses each field once and knows the sport’s rating name', () => {
    expect(guessMapping(['Vorname', 'vorname', 'Punkte'], 'Punkte')).toEqual(['firstName', null, 'rating']);
  });
});

describe('cell parsers', () => {
  it('reads genders, years and ratings in common spellings', () => {
    expect([parseGender('W'), parseGender('männlich'), parseGender('d'), parseGender(''), parseGender('?')]).toEqual(['f', 'm', 'd', null, undefined]);
    expect([parseBirthYear('2001'), parseBirthYear('17.03.2001'), parseBirthYear('2001-03-17'), parseBirthYear(''), parseBirthYear('01'), parseBirthYear('1850')]).toEqual([
      2001, 2001, 2001, null, undefined, undefined,
    ]);
    expect([parseRating('1520'), parseRating('1.520'), parseRating(''), parseRating('abc'), parseRating('4500')]).toEqual([1520, 1520, null, undefined, undefined]);
  });
});

describe('findExisting', () => {
  const values = (v: Partial<ImportValues>): ImportValues => ({
    firstName: '', lastName: null, club: null, gender: null, birthYear: null, licenceNo: null, rating: null, competitionIds: [], ...v,
  });

  it('matches by licence number or by name and birth year', () => {
    expect(findExisting(values({ firstName: 'B', lastName: 'X', licenceNo: 'l-7' }), existing)?.id).toBe('p-lic');
    expect(findExisting(values({ firstName: 'anna', lastName: 'BERGER' }), existing)?.id).toBe('p-anna');
    expect(findExisting(values({ firstName: 'Anna', lastName: 'Berger', birthYear: 2001 }), existing)?.id).toBe('p-anna');
    expect(findExisting(values({ firstName: 'Anna', lastName: 'Berger', birthYear: 2010 }), existing)).toBeNull();
    expect(findExisting(values({ firstName: 'Anna' }), existing)).toBeNull();
  });
});

describe('checkRows and toImportRequest', () => {
  const table = parseCsv(
    [
      'Vorname;Nachname;Verein;Jahrgang;QTTR;Konkurrenzen',
      'Anna;Berger;TTC Neu;2001;1750;Einzel Aktive, Doppel',
      'Gast;;;;;doppel',
      ';Ohne;;;;',
      'Clara;Wolf;;20x1;abc;Mixed',
      'Gast;;;;;',
    ].join('\n'),
  );
  const mapping = guessMapping(table[0]!);
  const checks = checkRows(table, mapping, competitions, existing);

  it('checks every row and finds existing players', () => {
    expect(checks.map((c) => [c.line, c.errors.map((e) => e.code), c.existing?.id ?? null])).toEqual([
      [2, [], 'p-anna'],
      [3, [], null],
      [4, ['missingFirstName'], null],
      [5, ['invalidYear', 'invalidRating', 'unknownCompetition'], null],
      [6, ['duplicateInFile'], null],
    ]);
    expect(checks[0]!.values.competitionIds).toEqual(['c-singles', 'c-doubles']);
    expect(checks[1]!.values).toMatchObject({ firstName: 'Gast', lastName: null, competitionIds: ['c-doubles'] });
  });

  it('keeps existing players as they are, or updates them with filled cells only', () => {
    expect(toImportRequest(checks, mapping, 'keep')).toEqual([
      { updateId: 'p-anna', firstName: 'Anna', competitionIds: ['c-singles', 'c-doubles'] },
      { firstName: 'Gast', lastName: null, club: null, birthYear: null, rating: null, competitionIds: ['c-doubles'] },
    ]);
    expect(toImportRequest(checks, mapping, 'update')[0]).toEqual({
      updateId: 'p-anna', firstName: 'Anna', lastName: 'Berger', club: 'TTC Neu', birthYear: 2001, rating: 1750, competitionIds: ['c-singles', 'c-doubles'],
    });
  });
});
