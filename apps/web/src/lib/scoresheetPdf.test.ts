import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { scoresheetPdf, winAnsi, type PdfSheet, type SheetLabels } from './scoresheetPdf.js';

const labels: SheetLabels = { game: 'Satz', result: 'Ergebnis', winner: 'Sieger', table: 'Tisch', competition: 'Konkurrenz', match: 'Spiel' };
const blank: PdfSheet = { eventName: 'Vereinsmeisterschaft', competition: null, label: null, sides: null, clubs: ['', ''], table: null, games: 5, pairs: false };
const filled: PdfSheet = {
  eventName: 'Vereinsmeisterschaft',
  competition: 'Herren A',
  label: 'Gruppe A, Runde 2',
  sides: ['Jürgen Müller / Łukasz Wiśniewski', 'Anna Groß'],
  clubs: ['TTC Süd', ''],
  table: '3',
  games: 5,
  pairs: false,
};
const mm = (pt: number) => Math.round((pt * 25.4) / 72);

describe('winAnsi', () => {
  it('keeps German and other Windows-1252 letters', () => {
    expect(winAnsi('Jürgen Groß – Café „Ü“ €')).toBe('Jürgen Groß – Café „Ü“ €');
  });

  it('drops accents the standard font does not know and replaces the rest', () => {
    expect(winAnsi('Łukasz Wiśniewski')).toBe('Lukasz Wisniewski');
    expect(winAnsi('Đorđe Ćirić')).toBe('Dorde Ciric');
    expect(winAnsi('王')).toBe('?');
  });
});

describe('scoresheetPdf', () => {
  it('puts four A6 sheets on each A4 page', async () => {
    const bytes = await scoresheetPdf(Array.from({ length: 5 }, () => blank), labels, 'a4', 'Spielzettel');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect([mm(width), mm(height)]).toEqual([210, 297]);
  });

  it('gives each sheet its own A6 page', async () => {
    const bytes = await scoresheetPdf([filled, { ...blank, pairs: true, games: 7 }, filled], labels, 'a6', 'Spielzettel');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect([mm(width), mm(height)]).toEqual([105, 148]);
    expect(doc.getTitle()).toBe('Spielzettel');
  });
});
