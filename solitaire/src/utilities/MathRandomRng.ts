import type { IRng } from "./IRng";

/**
 * Non-deterministic IRng backed by the host's Math.random. Use when
 * reproducibility is not required.
 */
export class MathRandomRng implements IRng {
  public next(): number {
    return Math.random();
  }

  public nextInt(maxExclusive: number): number {
    return Math.floor(Math.random() * maxExclusive);
  }
}
