import type { HexGrid, IGridCell } from "@gamebyte/gamelabsjs";
import type { HexCoord } from "../constants/HexCoord.js";
import { BlockItem } from "../models/BlockItem.js";

/**
 * Pure merge logic for the placement-driven Hexasort transfer system.
 *
 * A merge session starts from a *placed cell*. Each iteration:
 *
 * 1. {@link findMatchingNeighbors} returns the neighbors of the placed
 *    cell whose top color equals the placed cell's top color.
 * 2. If exactly one neighbor matches, {@link selectMergeTarget} picks
 *    either the placed cell or the neighbor as the target using a fixed
 *    hierarchy — evaluated in order, deciding at the first conclusive
 *    comparison:
 *      a. Higher contiguous top-same-color count (closest to completion).
 *      b. Fewer clusters in the stack (fewer color segments).
 *      c. Higher total block count (most occupied).
 *      d. Default to the placed cell.
 *    The other cell becomes the source.
 *    If two or more neighbors match, the placed cell is the target
 *    unconditionally and every matching neighbor is a source.
 * 3. The scheduler transfers matching-color tops from sources into the
 *    target one block at a time; when a source's top color no longer
 *    matches, it is skipped.
 * 4. After draining all sources, the target becomes the new placed cell
 *    and the cycle repeats (chained merges).
 *
 * {@link findDestructionCandidates} and
 * {@link countTopContiguousSameColor} are the utilities the scheduler's
 * destruction phase relies on.
 */
export class SortOperations {
  /** Cells adjacent to `(col, row)` whose top color equals the cell's top color. */
  public static findMatchingNeighbors(grid: HexGrid, col: number, row: number): HexCoord[] {
    const top = SortOperations.getTopColor(grid, col, row);
    if (top === null) return [];
    const matches: HexCoord[] = [];
    for (const n of grid.getAllNeighbors(col, row)) {
      if (SortOperations.getTopColor(grid, n.col, n.row) === top) matches.push(n);
    }
    return matches;
  }

  /**
   * Picks the merge target between a placed cell and its sole matching
   * neighbor. Returns the placed cell or the neighbor per the hierarchy
   * described in the class doc.
   */
  public static selectMergeTarget(grid: HexGrid, placed: HexCoord, neighbor: HexCoord): HexCoord {
    // 1. Closest to completion: higher contiguous top-same-color count.
    const placedTop = SortOperations.countTopContiguousSameColor(grid, placed.col, placed.row);
    const neighborTop = SortOperations.countTopContiguousSameColor(grid, neighbor.col, neighbor.row);
    if (placedTop !== neighborTop) return placedTop > neighborTop ? placed : neighbor;

    // 2. Fewest clusters (fewer contiguous color runs in the stack).
    const placedClusters = SortOperations.countStackClusters(grid, placed.col, placed.row);
    const neighborClusters = SortOperations.countStackClusters(grid, neighbor.col, neighbor.row);
    if (placedClusters !== neighborClusters) return placedClusters < neighborClusters ? placed : neighbor;

    // 3. Most occupied: higher total block count.
    const placedHeight = grid.getCell(placed.col, placed.row)?.size ?? 0;
    const neighborHeight = grid.getCell(neighbor.col, neighbor.row)?.size ?? 0;
    if (placedHeight !== neighborHeight) return placedHeight > neighborHeight ? placed : neighbor;

    // 4. Default: the newly placed cell.
    return placed;
  }

  /** Cells whose contiguous top-same-color count is `>= threshold`, in `(col, row)` order. */
  public static findDestructionCandidates(grid: HexGrid, threshold: number): HexCoord[] {
    const candidates: HexCoord[] = [];
    for (let col = 0; col < grid.columnCount; col++) {
      for (let row = 0; row < grid.rowCount; row++) {
        const count = SortOperations.countTopContiguousSameColor(grid, col, row);
        if (count >= threshold) candidates.push({ col, row });
      }
    }
    return candidates;
  }

  /**
   * Number of identically-colored blocks at the top of the stack at
   * `(col, row)` (contiguous from the top). 0 when the cell is empty.
   */
  public static countTopContiguousSameColor(grid: HexGrid, col: number, row: number): number {
    const cell = grid.getCell(col, row);
    if (!cell || cell.size === 0) return 0;
    const items = cell.items;
    const top = (items[items.length - 1] as BlockItem).colorIndex;
    let n = 0;
    for (let i = items.length - 1; i >= 0 && (items[i] as BlockItem).colorIndex === top; i--) n++;
    return n;
  }

  /**
   * Number of contiguous same-color runs in the cell's stack.
   * `[R, R, B, R]` → 3 clusters. `[R, R, R]` → 1. Empty → 0.
   */
  public static countStackClusters(grid: HexGrid, col: number, row: number): number {
    const cell = grid.getCell(col, row);
    if (!cell || cell.size === 0) return 0;
    const items = cell.items;
    let clusters = 1;
    for (let i = 1; i < items.length; i++) {
      if ((items[i] as BlockItem).colorIndex !== (items[i - 1] as BlockItem).colorIndex) clusters++;
    }
    return clusters;
  }

  /** Top color index of the cell at `(col, row)`, or `null` for an empty / out-of-bounds cell. */
  public static getTopColor(grid: HexGrid, col: number, row: number): number | null {
    const cell = grid.getCell(col, row);
    if (!cell || cell.size === 0) return null;
    return (cell.item as BlockItem).colorIndex;
  }

  /** All color indices in the cell's stack, bottom → top, or `null` for an empty cell. */
  public static getColors(cell: IGridCell | null): readonly number[] | null {
    if (!cell || cell.size === 0) return null;
    return cell.items.map((it) => (it as BlockItem).colorIndex);
  }
}
