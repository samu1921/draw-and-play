import { describe, expect, it } from 'vitest';
import { defaultLines, fillPlaceholders, resolveTemplate } from './certificate.js';

const values = { name: 'Anna Berger', club: 'TTC Nord', place: '1', competition: 'Damen A', event: 'VM 2026', date: '7. November 2026' };
const defaults = { top: '{veranstaltung}', title: 'Urkunde', name: '{name}', sub: '{verein}', place: '{platz}. Platz', text: 'im Wettbewerb {konkurrenz}', bottom: '{datum}' };

describe('fillPlaceholders', () => {
  it('fills German and English placeholders, in any case', () => {
    expect(fillPlaceholders('{Platz}. Platz im Wettbewerb {konkurrenz}', values)).toBe('1. Platz im Wettbewerb Damen A');
    expect(fillPlaceholders('{name} ({club}), {event}, {DATE}', values)).toBe('Anna Berger (TTC Nord), VM 2026, 7. November 2026');
  });

  it('leaves unknown placeholders as typed', () => {
    expect(fillPlaceholders('{nmae} wins', values)).toBe('{nmae} wins');
  });
});

describe('resolveTemplate', () => {
  it('uses the built-in texts without a saved template', () => {
    expect(resolveTemplate(null, defaults)).toEqual({ mode: 'designed', showLogo: true, backgroundId: null, lines: defaults, signatures: [] });
  });

  it('takes saved lines, keeps an emptied line empty and the rest from the defaults', () => {
    const t = resolveTemplate({ mode: 'textOnly', lines: { title: 'Ehrenurkunde', sub: '' }, signatures: ['Turnierleitung'] }, defaults);
    expect(t.mode).toBe('textOnly');
    expect(t.lines.title).toBe('Ehrenurkunde');
    expect(t.lines.sub).toBe('');
    expect(t.lines.place).toBe('{platz}. Platz');
    expect(t.signatures).toEqual(['Turnierleitung']);
  });
});

describe('defaultLines', () => {
  it('keeps the placeholders of the built-in texts', () => {
    expect(defaultLines('de').place).toBe('{platz}. Platz');
    expect(defaultLines('en').text).toBe('in the competition {competition}');
    expect(defaultLines('fr')).toEqual(defaultLines('en'));
  });
});
