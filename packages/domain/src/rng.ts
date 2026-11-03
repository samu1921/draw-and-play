/** Reproducible random number generator: same seed → same draw. */
export interface Rng {
  /** Uniform in [0, 1) */
  next(): number;
  /** Integer in [0, n) */
  int(n: number): number;
}

export type Seed = string | number;

export function createRng(seed: Seed): Rng {
  let state = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n) };
}

/** Fisher-Yates; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function hashString(value: string): number {
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
