import { describe, expect, it } from 'vitest';
import { duplicateNames, isDuplicate, listName } from './persons.js';

describe('listName', () => {
  it('puts the last name first, or shows the first name alone', () => {
    expect(listName({ name: 'Max Muster', firstName: 'Max', lastName: 'Muster' })).toBe('Muster, Max');
    expect(listName({ name: 'Max', firstName: 'Max', lastName: null })).toBe('Max');
    expect(listName({ name: 'Max' })).toBe('Max');
  });
});

describe('duplicateNames', () => {
  it('finds players who look the same in public views', () => {
    const persons = [
      { name: 'Max Muster', publicName: 'Max M.' },
      { name: 'Max Meier', publicName: 'Max M.' },
      { name: 'max ', publicName: 'max ' },
      { name: 'Max', publicName: 'Max' },
      { name: 'Anna', publicName: 'Anna' },
    ];
    const duplicates = duplicateNames(persons);
    expect([...duplicates].sort()).toEqual(['max', 'max m.']);
    expect(persons.map((p) => isDuplicate(p, duplicates))).toEqual([true, true, true, true, false]);
  });

  it('falls back to the full name', () => {
    expect([...duplicateNames([{ name: 'Lea' }, { name: 'Lea' }, { name: 'Lena' }])]).toEqual(['lea']);
  });
});
