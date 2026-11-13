import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Score sheets as a PDF in A6, either four to an A4 page with cut lines or one per A6 page. Drawn as vectors with
 * the standard Helvetica font, so the file stays small and prints sharp at the exact size, independent of the
 * browser's print dialog.
 */

/** a4: four A6 sheets per A4 page (2 × 2) with cut lines; a6: one sheet per A6 page */
export type SheetPaper = 'a4' | 'a6';

/** One sheet; a blank one leaves out competition, match, sides and table */
export interface PdfSheet {
  eventName: string;
  competition: string | null;
  /** "Group A, round 2", "Semifinal 1" */
  label: string | null;
  /** Left out: lines to write the names on */
  sides: [string, string] | null;
  clubs: [string, string];
  table: string | null;
  /** Rows for the games */
  games: number;
  /** Blank sheets of doubles get two name lines per side */
  pairs: boolean;
}

export interface SheetLabels {
  game: string;
  result: string;
  winner: string;
  table: string;
  competition: string;
  match: string;
}

const MM = 72 / 25.4;
const A6 = { w: 105, h: 148 } as const;
const A4 = { w: 210, h: 297 } as const;
const MARGIN = 7;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.65, 0.65, 0.65);

// The standard fonts only know Windows-1252; everything else would make pdf-lib throw.
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** Text the standard font can draw: accents it does not know are dropped (ł → l stays readable), the rest becomes "?" */
export function winAnsi(text: string): string {
  let out = '';
  for (const char of text.replace(/\s+/g, ' ')) {
    const code = char.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.includes(char)) {
      out += char;
      continue;
    }
    const special: Record<string, string> = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', ș: 's', Ș: 'S', ț: 't', Ț: 'T' };
    const base = special[char] ?? char.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += /^[\x20-\x7e]+$/.test(base) ? base : '?';
  }
  return out;
}

/** Placement of a sheet on its page, in mm from the page's top left corner */
interface Slot {
  page: PDFPage;
  x: number;
  y: number;
  w: number;
  h: number;
}

class Pen {
  constructor(
    private readonly slot: Slot,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {}

  private px(x: number) {
    return (this.slot.x + x) * MM;
  }
  private py(y: number) {
    return (this.slot.page.getHeight() / MM - this.slot.y - y) * MM;
  }

  width(text: string, size: number, font = this.regular) {
    return font.widthOfTextAtSize(text, size) / MM;
  }

  /** Shrinks the text down to minSize to fit, then cuts it off with "…" */
  fit(text: string, size: number, minSize: number, maxWidth: number, font = this.regular): { text: string; size: number } {
    let s = size;
    while (s > minSize && this.width(text, s, font) > maxWidth) s -= 0.25;
    if (this.width(text, s, font) <= maxWidth) return { text, size: s };
    let cut = text;
    while (cut.length > 1 && this.width(`${cut}…`, s, font) > maxWidth) cut = cut.slice(0, -1);
    return { text: `${cut.trimEnd()}…`, size: s };
  }

  /** y is the baseline */
  text(
    raw: string,
    x: number,
    y: number,
    o: { size: number; minSize?: number; maxWidth?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'center' | 'right' },
  ) {
    const font = o.bold ? this.bold : this.regular;
    const clean = winAnsi(raw);
    const { text, size } = o.maxWidth ? this.fit(clean, o.size, o.minSize ?? o.size, o.maxWidth, font) : { text: clean, size: o.size };
    const w = this.width(text, size, font);
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    this.slot.page.drawText(text, { x: this.px(left), y: this.py(y), size, font, color: o.color ?? BLACK });
  }

  line(x1: number, y1: number, x2: number, y2: number, thickness = 0.5, color = BLACK) {
    this.slot.page.drawLine({ start: { x: this.px(x1), y: this.py(y1) }, end: { x: this.px(x2), y: this.py(y2) }, thickness, color });
  }

  rect(x: number, y: number, w: number, h: number, thickness = 0.8) {
    this.slot.page.drawRectangle({ x: this.px(x), y: this.py(y + h), width: w * MM, height: h * MM, borderWidth: thickness, borderColor: BLACK });
  }
}

/** A value under its label in small grey print */
function field(pen: Pen, label: string, value: string, x: number, y: number, w: number) {
  pen.text(label, x, y, { size: 6, color: GREY, maxWidth: w });
  pen.text(value, x, y + 4.5, { size: 9, minSize: 6.5, bold: true, maxWidth: w });
}

function drawSheet(pen: Pen, sheet: PdfSheet, labels: SheetLabels, size: { w: number; h: number }) {
  const left = MARGIN;
  const right = size.w - MARGIN;
  const inner = right - left;

  // Head: event, competition and match on the left, the table in a box on the right. Blank sheets only carry
  // the event; competition and group are not worth writing by hand.
  const boxW = 20;
  const boxH = 13;
  const headW = inner - boxW - 3;
  const detailed = sheet.competition !== null || sheet.label !== null;
  let top: number;
  if (detailed) {
    if (sheet.eventName) pen.text(sheet.eventName, left, MARGIN + 2.5, { size: 6.5, color: GREY, maxWidth: headW });
    if (sheet.competition) field(pen, labels.competition, sheet.competition, left, MARGIN + 6, headW);
    if (sheet.label) field(pen, labels.match, sheet.label, left, MARGIN + 15, headW);
    top = MARGIN + 25;
  } else {
    if (sheet.eventName) pen.text(sheet.eventName, left, MARGIN + 11, { size: 10, minSize: 7, bold: true, maxWidth: headW });
    top = MARGIN + 3.5 + boxH + 4;
  }

  const boxY = MARGIN + 3.5;
  pen.rect(right - boxW, boxY, boxW, boxH);
  pen.text(labels.table, right - boxW / 2, boxY + 3, { size: 6, color: GREY, align: 'center', maxWidth: boxW - 2 });
  if (sheet.table) pen.text(sheet.table, right - boxW / 2, boxY + 10.5, { size: 14, minSize: 7, bold: true, align: 'center', maxWidth: boxW - 2 });

  // Grid: game number and one column per side
  const numW = 12;
  const sideW = (inner - numW) / 2;
  const nameLines = sheet.sides ? 1 : sheet.pairs ? 2 : 1;
  const headH = sheet.sides ? 13 : 7 + 6 * nameLines;
  // The games, then the result and a row to tick the winner
  const rows = sheet.games + 2;
  const rowH = Math.min(11.5, (size.h - MARGIN - top - headH) / rows);
  const bottom = top + headH + rows * rowH;
  const colX = [left, left + numW, left + numW + sideW, right];

  pen.text(labels.game, left + numW / 2, top + headH - 2.5, { size: 6.5, align: 'center', maxWidth: numW - 1, minSize: 5 });
  for (const side of [0, 1] as const) {
    const x = colX[side + 1]!;
    const cx = x + sideW / 2;
    if (sheet.sides) {
      const name = winAnsi(sheet.sides[side]);
      const parts = name.split(' / ');
      // Pairs that do not fit on one line get a line each
      const twoLines = parts.length === 2 && pen.width(name, 8, pen.bold) > sideW - 2;
      const club = sheet.clubs[side];
      if (twoLines) {
        pen.text(parts[0]!, cx, top + 4.2, { size: 7.5, minSize: 5.5, bold: true, align: 'center', maxWidth: sideW - 2 });
        pen.text(parts[1]!, cx, top + 7.6, { size: 7.5, minSize: 5.5, bold: true, align: 'center', maxWidth: sideW - 2 });
      } else {
        pen.text(name, cx, top + (club ? 5.5 : 7.5), { size: 8, minSize: 5.5, bold: true, align: 'center', maxWidth: sideW - 2 });
      }
      if (club) pen.text(club, cx, top + 11, { size: 6, minSize: 5, color: GREY, align: 'center', maxWidth: sideW - 2 });
    } else {
      for (let i = 0; i < nameLines; i++) pen.line(x + 2, top + 7 + 6 * i, x + sideW - 2, top + 7 + 6 * i, 0.4, LIGHT);
    }
  }

  // Lines: outer frame, column separators, rows; result and winner sit under a heavier line
  pen.rect(left, top, inner, bottom - top);
  for (const x of colX.slice(1, -1)) pen.line(x, top, x, bottom);
  for (let i = 0; i < rows; i++) {
    const rowTop = top + headH + i * rowH;
    const game = i < sheet.games;
    pen.line(left, rowTop, right, rowTop, i === 0 || i === sheet.games ? 1 : 0.5);
    const label = game ? String(i + 1) : i === sheet.games ? labels.result : labels.winner;
    pen.text(label, left + numW / 2, rowTop + rowH / 2 + 1.2, { size: game ? 9 : 6, minSize: 4.5, align: 'center', maxWidth: numW - 1, bold: !game });
  }
  // A box per side to tick the winner
  const box = 4.5;
  const winnerTop = top + headH + (rows - 1) * rowH;
  for (const side of [0, 1] as const) pen.rect(colX[side + 1]! + sideW / 2 - box / 2, winnerTop + (rowH - box) / 2, box, box, 0.7);
}

export async function scoresheetPdf(sheets: readonly PdfSheet[], labels: SheetLabels, paper: SheetPaper, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(title));
  doc.setCreator('Draw & Play');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  if (paper === 'a6') {
    for (const sheet of sheets) {
      const page = doc.addPage([A6.w * MM, A6.h * MM]);
      drawSheet(new Pen({ page, x: 0, y: 0, ...A6 }, regular, bold), sheet, labels, A6);
    }
  } else {
    const cell = { w: A4.w / 2, h: A4.h / 2 };
    for (let start = 0; start < sheets.length; start += 4) {
      const page = doc.addPage([A4.w * MM, A4.h * MM]);
      sheets.slice(start, start + 4).forEach((sheet, i) => {
        const slot = { page, x: (i % 2) * cell.w, y: Math.floor(i / 2) * cell.h, ...cell };
        drawSheet(new Pen(slot, regular, bold), sheet, labels, cell);
      });
      // Cut lines through the middle, dashed and light so they do not get in the way
      const dashed = { thickness: 0.5, color: LIGHT, dashArray: [4, 3] };
      page.drawLine({ start: { x: cell.w * MM, y: 0 }, end: { x: cell.w * MM, y: A4.h * MM }, ...dashed });
      page.drawLine({ start: { x: 0, y: cell.h * MM }, end: { x: A4.w * MM, y: cell.h * MM }, ...dashed });
    }
  }
  return doc.save();
}

/** Starts the download of a PDF in the browser */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
