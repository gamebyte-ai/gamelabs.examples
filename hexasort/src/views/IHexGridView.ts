import type { IHexGrid, IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { HexCoord } from "../constants/HexCoord.js";

/**
 * Alias kept for readability at the view boundary — a hover callback
 * talks about "the cell the pointer is over" rather than "a HexCoord".
 */
export type HexCellCoord = HexCoord;

export interface IHexGridView extends IView {
  /** (Re)builds visible cells for the supplied grid model. */
  buildGrid(grid: IHexGrid): void;

  /** Sets the grid root rotation around the world Y (up) axis, in radians. */
  setRotationY(radians: number): void;

  /**
   * Subscribes to horizontal pointer-drag deltas on the canvas, reported in
   * CSS pixels. Controllers use this to drive grid rotation — the view does
   * not interpret drag intent.
   */
  onHorizontalDrag(callback: (deltaPixelsX: number) => void): Unsubscribe;

  /**
   * Subscribes to hovered-cell changes. Fires with the new hovered cell (or
   * `null` when the pointer leaves the grid). The view always tracks hover;
   * the controller decides whether to reflect it visually.
   */
  onCellHoverChanged(callback: (cell: HexCellCoord | null) => void): Unsubscribe;

  /** Paints the given cell in the highlight color. */
  setHighlightedCell(col: number, row: number): void;

  /** Restores all cells to the base color. */
  clearHighlight(): void;

  /**
   * Renders a stack of colored blocks standing on the cell at `(col, row)`.
   * `colors` are indices into `HexaSortConfig.blockColors`, bottom → top.
   */
  renderBlockStack(col: number, row: number, colors: readonly number[]): void;

  /** Removes the topmost block visual from the cell (no-op if empty). */
  popTopBlock(col: number, row: number): void;

  /** Places a single new block on top of the cell at `(col, row)`. */
  pushTopBlock(col: number, row: number, colorIndex: number): void;

  /**
   * GSAP-animates a single block from the top of `(srcCol,srcRow)` to the
   * new top of `(tgtCol,tgtRow)`. The view handles the full visual
   * transition: remove the source's top mesh, spawn a flying mesh, tween
   * its position, and on completion attach a permanent block to the
   * target. `onComplete` fires after the tween resolves.
   */
  animateBlockMove(
    sourceCol: number,
    sourceRow: number,
    targetCol: number,
    targetRow: number,
    colorIndex: number,
    onComplete: () => void,
  ): void;

  /**
   * GSAP-animates the top block of `(col,row)`: scale → 0, then remove
   * from the scene. `onComplete` fires after the tween resolves.
   */
  animateBlockDestroy(col: number, row: number, onComplete: () => void): void;
}
