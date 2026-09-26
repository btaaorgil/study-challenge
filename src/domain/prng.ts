// Deterministic seeded pseudo-random helpers used by Daily_Challenge generation.
// No `Math.random()` is used anywhere in generation -- see design.md's
// "Determinism note" under Domain: generateDailyChallenge -- so the same seed
// always produces the same sequence, which is what makes reopening the
// Challenge_View on the same day idempotent (Requirement 3.5).

/** Deterministically hashes a string to a 32-bit unsigned integer (djb2 variant). */
export function hashStringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * mulberry32: a small, fast, deterministic PRNG. Given the same 32-bit seed,
 * it always produces the same sequence of floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a deterministic RNG function from a string seed. */
export function createSeededRng(seed: string): () => number {
  return mulberry32(hashStringToSeed(seed));
}

/**
 * Deterministic Fisher-Yates shuffle driven by the given RNG. Does not
 * mutate the input array.
 */
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
