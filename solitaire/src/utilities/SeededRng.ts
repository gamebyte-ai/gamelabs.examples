import type { IRng } from "./IRng";

/**
 * Mulberry32 — small, fast, seedable PRNG. Outputs values in [0, 1).
 * Adequate for shuffling cards and variance-bearing test setup; not
 * cryptographic.
 */
export class SeededRng implements IRng {
  private _state: number;

  public constructor(seed: number) {
    this._state = seed >>> 0;
  }

  public next(): number {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}
