/**
 * Small CSV reader for imports: quoted fields with doubled quotes and line breaks, CRLF or LF, and the delimiter
 * Excel happens to use (semicolon in German, comma in English, tab when copied from a sheet).
 */

/** UTF-8 if the bytes are valid UTF-8, else Windows-1252 (what older Excel versions write); without a BOM */
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.startsWith('﻿') ? text.slice(1) : text;
}

/** The delimiter that occurs most often in the first line, outside quotes */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char in counts) counts[char as keyof typeof counts]++;
  }
  const best = (Object.entries(counts) as [keyof typeof counts, number][]).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ';';
}

/** Rows of fields; rows without any content are left out */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) endField();
    else if (char === '\n') endRow();
    else if (char === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else field += char;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
