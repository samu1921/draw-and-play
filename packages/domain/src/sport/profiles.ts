import { tableTennis } from './tableTennis.js';
import type { SportProfile } from './types.js';

/** Every sport the software supports; an event names one of them in `sport` */
export const sportProfiles = {
  'table-tennis': tableTennis,
} as const satisfies Record<string, SportProfile>;

export type SportId = keyof typeof sportProfiles;

export const SPORT_IDS = Object.keys(sportProfiles) as [SportId, ...SportId[]];

export const DEFAULT_SPORT: SportId = 'table-tennis';

export function isSportId(id: string): id is SportId {
  return Object.hasOwn(sportProfiles, id);
}

/** The profile of a stored sport id; an unknown id is a data error, not a user error. */
export function getSportProfile(id: string): SportProfile {
  if (!isSportId(id)) throw new Error(`Unknown sport "${id}"`);
  return sportProfiles[id];
}
