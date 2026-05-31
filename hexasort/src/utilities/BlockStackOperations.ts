import type { BlockStack } from "../models/BlockStack.js";
import { HexaSortConfig } from "../HexaSortConfig.js";

/**
 * Mints {@link BlockStack}s with monotonically increasing IDs and enforces
 * the contiguous-segment invariant on their color layouts:
 *
 * - A stack is an ordered sequence of 1 ≤ N ≤ paletteSize *segments*.
 * - Each segment is ≥ 1 blocks of a single color.
 * - Segments have pair-wise distinct colors, so every color index appears
 *   in at most one segment — a single color can never be split across
 *   non-adjacent positions.
 *
 * Valid:   `[blue, blue, red, red]`       (two segments: blue×2, red×2)
 * Valid:   `[blue]`                       (one segment)
 * Invalid: `[blue, red, blue, red]`       (blue appears in two segments)
 *
 * Named `*Operations` — this is a stateful rules/operations utility
 * (not a browser-API service).
 *
 * {@link isValid} checks the invariant; {@link createStack} throws when a
 * caller supplies an explicit color list that violates it;
 * {@link createRandomStack} constructs random stacks that are valid by
 * construction.
 */
export class BlockStackOperations {
  private readonly _config: HexaSortConfig;
  private _nextId: number;

  public constructor(config: HexaSortConfig, startId: number = 1) {
    this._config = config;
    this._nextId = startId;
  }

  public createRandomStack(): BlockStack {
    const colors = BlockStackOperations._buildContiguousStack(
      this._config.spawnedStackLength,
      this._config.blockColors.length,
    );
    return { id: this._nextId++, colors };
  }

  public createStack(colors: readonly number[]): BlockStack {
    if (!BlockStackOperations.isValid(colors)) {
      throw new Error(
        `Invalid block stack [${colors.join(", ")}]: each color must form a single contiguous segment`,
      );
    }
    return { id: this._nextId++, colors };
  }

  /**
   * Returns `true` iff `colors` is grouped into contiguous same-color runs
   * with each color appearing in at most one run.
   */
  public static isValid(colors: readonly number[]): boolean {
    const openedSegments = new Set<number>();
    let previous: number | null = null;
    for (const color of colors) {
      if (color === previous) continue;
      if (openedSegments.has(color)) return false;
      openedSegments.add(color);
      previous = color;
    }
    return true;
  }

  /**
   * Builds a random stack of `length` blocks whose color layout satisfies
   * {@link isValid}: `N` segments with pair-wise distinct colors, each
   * ≥ 1 block long, summing to `length`.
   */
  private static _buildContiguousStack(length: number, paletteSize: number): number[] {
    if (length <= 0 || paletteSize <= 0) return [];
    const maxSegments = Math.min(length, paletteSize);
    // Random segment count in [1, maxSegments] — uniform.
    const segmentCount = 1 + Math.floor(Math.random() * maxSegments);

    // Pick `segmentCount` distinct palette indices via Fisher–Yates prefix.
    const indices: number[] = [];
    for (let i = 0; i < paletteSize; i++) indices.push(i);
    BlockStackOperations._shuffleInPlace(indices);
    const segmentColors = indices.slice(0, segmentCount);

    // Allocate ≥ 1 block per segment, then distribute the remaining
    // `length - segmentCount` blocks among segments at random.
    const segmentLengths: number[] = new Array<number>(segmentCount).fill(1);
    let remaining = length - segmentCount;
    while (remaining > 0) {
      const idx = Math.floor(Math.random() * segmentCount);
      segmentLengths[idx] = segmentLengths[idx]! + 1;
      remaining--;
    }

    // Emit colors segment-by-segment so the result is contiguous by
    // construction.
    const colors: number[] = [];
    for (let s = 0; s < segmentCount; s++) {
      const color = segmentColors[s]!;
      const segLen = segmentLengths[s]!;
      for (let j = 0; j < segLen; j++) colors.push(color);
    }
    return colors;
  }

  private static _shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
  }
}
