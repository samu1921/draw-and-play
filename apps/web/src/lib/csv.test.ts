import { describe, expect, it } from 'vitest';
import { decodeCsv, detectDelimiter, parseCsv } from './csv.js';

describe('decodeCsv', () => {
  it('reads UTF-8 with and without BOM', () => {
    expect(decodeCsv(new TextEncoder().encode('﻿Krüger;Weiß'))).toBe('Krüger;Weiß');
    expect(decodeCsv(new TextEncoder().encode('Krüger'))).toBe('Krüger');
  });

  it('falls back to Windows-1252 for old Excel files', () => {
    // "Krüger" in Windows-1252: ü = 0xFC
    expect(decodeCsv(new Uint8Array([0x4b, 0x72, 0xfc, 0x67, 0x65, 0x72]))).toBe('Krüger');
  });
});

describe('detectDelimiter', () => {
  it('picks the delimiter of the header line', () => {
    expect(detectDelimiter('Vorname;Nachname;Verein\nA;B;C')).toBe(';');
    expect(detectDelimiter('First name,Last name\nA,B')).toBe(',');
    expect(detectDelimiter('Vorname\tNachname')).toBe('\t');
    expect(detectDelimiter('"Name; with semicolon",Club,Born')).toBe(',');
    expect(detectDelimiter('Vorname')).toBe(';');
  });
});

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, line breaks in fields and CRLF', () => {
    expect(parseCsv('a;"b;c";"say ""hi"""\r\n"multi\nline";x;\r\n', ';')).toEqual([
      ['a', 'b;c', 'say "hi"'],
      ['multi\nline', 'x', ''],
    ]);
  });

  it('skips empty rows and keeps a last row without line break', () => {
    expect(parseCsv('a,b\n\n,\nc,d', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
