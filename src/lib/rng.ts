// =====================================================================
// Seeded RNG — Mulberry32 wrapped in a small chainable API.
// Important so that career generation is reproducible from a seed.
// =====================================================================

export interface Rng {
  next: () => number;
  int: (min: number, maxIncl: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  pickWeighted: <T>(items: readonly T[], weights: readonly number[]) => T;
  bool: (probability?: number) => boolean;
  gaussian: (mean: number, stdev: number) => number;
  shuffle: <T>(arr: T[]) => T[];
  fork: (label: string) => Rng;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  const numericSeed =
    typeof seed === "number" ? seed >>> 0 : hashStringToSeed(seed);
  const rand = mulberry32(numericSeed || 1);

  const api: Rng = {
    next: () => rand(),
    int: (min, maxIncl) => Math.floor(rand() * (maxIncl - min + 1)) + min,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    pickWeighted: (items, weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rand() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    bool: (probability = 0.5) => rand() < probability,
    gaussian: (mean, stdev) => {
      const u = 1 - rand();
      const v = rand();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + z * stdev;
    },
    shuffle: (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    fork: (label) => createRng(numericSeed ^ hashStringToSeed(label)),
  };
  return api;
}

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
