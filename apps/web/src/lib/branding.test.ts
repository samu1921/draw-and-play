import { describe, expect, it } from 'vitest';
import { mergeBranding } from './branding.js';

describe('mergeBranding', () => {
  const installation = { name: 'TTC Musterstadt', accent: '#b01e2d', logoId: 'club-logo', displayDim: 50 };

  it('takes each field from the event when it has one', () => {
    expect(mergeBranding(installation, { accent: '#0a7d3b', displayBackgroundId: 'hall' })).toEqual({
      name: 'TTC Musterstadt',
      accent: '#0a7d3b',
      logoId: 'club-logo',
      displayDim: 50,
      displayBackgroundId: 'hall',
    });
  });

  it('falls back for fields the event leaves empty', () => {
    expect(mergeBranding(installation, { name: null, accent: '', logoId: undefined })).toEqual(installation);
    expect(mergeBranding(installation, null)).toEqual(installation);
  });

  it('keeps a dimming of zero chosen for the event', () => {
    expect(mergeBranding(installation, { displayDim: 0 }).displayDim).toBe(0);
  });
});
