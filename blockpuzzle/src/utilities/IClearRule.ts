import type { GridCoord, IBaseGrid } from "@gamebyte/gamelabsjs";

/**
 * What {@link IClearRule.computeClears} returns.
 *
 * - `cells` — every cell that should be cleared (full rows + full
 *   columns, dedup'd). Drives the view's ghost line-highlight and
 *   the controller's per-cell grid removal.
 * - `fullRows` / `fullCols` — indices of the rows / columns that
 *   the rule judged fully filled. Drives the per-line score award
 *   (`score.clearedLine × (fullRows.length + fullCols.length)`).
 */
export interface ClearsResult {
  readonly cells: readonly GridCoord[];
  readonly fullRows: readonly number[];
  readonly fullCols: readonly number[];
}

/**
 * Structural seam: which cells should be cleared after a placement.
 *
 * Variants:
 * - **Full row/column clear**: the canonical Block Blast / 1010!
 *   rule (implemented by {@link LineClearRule}).
 * - **Region / colour-match**: any connected group of N+ same-colour
 *   cells clears (Block Blast variant; Candy-Crush-flavoured). Would
 *   leave `fullRows` / `fullCols` empty and use only `cells`.
 * - **Hybrid**: lines clear AND any same-colour region of 5+ also
 *   clears, both triggered by the same placement.
 *
 * `placedCells` carries the cells the just-placed piece occupies, so
 * region-based rules can seed their search from the placement
 * footprint rather than scanning the whole grid every turn.
 */
export interface IClearRule {
  /** Cells (and lines) that should be cleared in response to a
   *  placement at `placedCells`. Returning an empty `cells` array
   *  means no clears trigger for this placement. */
  computeClears(grid: IBaseGrid, placedCells: readonly GridCoord[]): ClearsResult;
}
