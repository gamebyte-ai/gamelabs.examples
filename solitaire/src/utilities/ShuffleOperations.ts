import type { IRng } from "./IRng";

export class ShuffleOperations {
  public static shuffleInPlace<T>(arr: T[], rng: IRng): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
