import { describe, expect, it } from 'vitest';
import { composeTitle } from './pageTitle.js';

describe('composeTitle', () => {
  it('names page, event and app', () => {
    expect(composeTitle({ page: 'Spielbetrieb', event: 'VM 2026', app: 'Draw & Play' })).toBe('Spielbetrieb · VM 2026 – Draw & Play');
  });

  it('leaves out what is missing', () => {
    expect(composeTitle({ page: 'Benutzer', app: 'Draw & Play' })).toBe('Benutzer – Draw & Play');
    expect(composeTitle({ event: 'VM 2026', app: 'Draw & Play' })).toBe('VM 2026 – Draw & Play');
    expect(composeTitle({ app: 'Draw & Play' })).toBe('Draw & Play');
  });

  it('shows only the event on public pages', () => {
    expect(composeTitle({ page: 'x', event: 'VM 2026', app: 'Draw & Play', publicPage: true })).toBe('VM 2026');
    expect(composeTitle({ app: 'Draw & Play', publicPage: true })).toBe('Draw & Play');
  });
});
