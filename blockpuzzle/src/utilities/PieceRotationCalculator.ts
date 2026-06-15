import type { PieceCells, PieceType } from "../BlockPuzzleConfig";

/**
 * Builds the per-piece-type pool of unique rotated shapes the
 * spawner draws from.
 *
 * For every entry in the catalog, the four 90° CW rotations are
 * computed and de-duplicated by their canonical cell-set — so a
 * shape's own rotational symmetry naturally collapses the pool:
 * - 2×2 / 3×3 squares → 1 variant
 * - lines (1×N) → 2 variants (horizontal, vertical)
 * - L-shapes → 4 variants
 *
 * Runs once at config-load. Piece shapes are static catalog data,
 * so the result is safe to cache (and the {@link BlockPuzzleConfig}
 * constructor does cache it on `rotatedShapes`).
 *
 * Conventions:
 * - Row axis increases downward (screen-style), so the rotation
 *   maps `(col, row) → (-row, col)`.
 * - Every returned variant is normalised so its bounding box
 *   top-left is at `(0, 0)`. The visual + placement code assumes
 *   this anchoring everywhere.
 */
export class PieceRotationCalculator {
  /** Compute the rotation pool for every piece type in the catalog. */
  public static computeAll(pieceTypes: readonly PieceType[]): ReadonlyMap<PieceType, readonly PieceCells[]> {
    const out = new Map<PieceType, readonly PieceCells[]>();
    for (const type of pieceTypes) {
      out.set(type, PieceRotationCalculator.uniqueRotations(type.cells));
    }
    return out;
  }

  /** All distinct 90° CW rotations of `cells`, normalised. Returns
   *  1..4 entries depending on the shape's rotational symmetry. */
  public static uniqueRotations(cells: PieceCells): readonly PieceCells[] {
    const seen = new Set<string>();
    const out: PieceCells[] = [];
    let current = PieceRotationCalculator.normalize(cells);
    for (let i = 0; i < 4; i++) {
      const key = PieceRotationCalculator.canonical(current);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(current);
      }
      current = PieceRotationCalculator.rotate90CW(current);
    }
    return out;
  }

  /** 90° clockwise rotation around the origin, followed by a
   *  normalise so the bbox top-left sits at `(0, 0)`. */
  private static rotate90CW(cells: PieceCells): PieceCells {
    const mapped: (readonly [number, number])[] = [];
    for (const [c, r] of cells) {
      mapped.push([-r, c] as const);
    }
    return PieceRotationCalculator.normalize(mapped);
  }

  /** Shift `cells` so its bounding box top-left lands at `(0, 0)`. */
  private static normalize(cells: readonly (readonly [number, number])[]): PieceCells {
    let minC = Infinity;
    let minR = Infinity;
    for (const [c, r] of cells) {
      if (c < minC) minC = c;
      if (r < minR) minR = r;
    }
    const out: (readonly [number, number])[] = [];
    for (const [c, r] of cells) {
      out.push([c - minC, r - minR] as const);
    }
    return out;
  }

  /** Order-independent string key for cell-set equality. */
  private static canonical(cells: PieceCells): string {
    return cells
      .map(([c, r]) => `${c},${r}`)
      .sort()
      .join("|");
  }
}
