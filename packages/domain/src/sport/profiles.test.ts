import { describe, expect, it } from 'vitest';
import { DEFAULT_SPORT, getSportProfile, isSportId, SPORT_IDS, sportProfiles } from './profiles.js';
import { tableTennis } from './tableTennis.js';

describe('sport profiles', () => {
  it('lists every profile under its own id', () => {
    for (const id of SPORT_IDS) expect(sportProfiles[id].id).toBe(id);
    expect(SPORT_IDS).toContain(DEFAULT_SPORT);
  });

  it('looks up table tennis', () => {
    expect(getSportProfile('table-tennis')).toBe(tableTennis);
    expect(isSportId('table-tennis')).toBe(true);
  });

  it('rejects unknown ids, including inherited object keys', () => {
    expect(isSportId('chess')).toBe(false);
    expect(isSportId('toString')).toBe(false);
    expect(() => getSportProfile('chess')).toThrow('Unknown sport "chess"');
  });
});
