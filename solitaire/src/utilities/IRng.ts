/**
 * Pluggable random-number source. Strategies live next to it in `utilities/`
 * — `SeededRng` (mulberry32, reproducible) and `MathRandomRng` (system
 * Math.random). Consumers depend on the interface only.
 */
export interface IRng {
  /** Returns a value in [0, 1). */
  next(): number;
  /** Returns an integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}
