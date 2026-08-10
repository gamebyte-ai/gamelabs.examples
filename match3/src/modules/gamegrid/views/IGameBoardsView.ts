import type { IGridView } from "@gamebyte/gamelabsjs";

/** A gem's world position, captured before the grid rebuilt its object. */
export type GemPosition = { x: number; y: number; z: number };

export interface IGameBoardsView extends IGridView {
  /** The `PointerEvent` is forwarded so the controller can tell a swipe from a tap. */
  setCellPointerDownHandler(handler: ((gridId: number, col: number, row: number, event: PointerEvent) => void) | null): void;
  updateGemSelection(gridId: number, selected: { col: number; row: number } | null): void;
  animateInvalidSwap(gridId: number, r1: number, c1: number, r2: number, c2: number): Promise<void>;
  animateValidSwap(gridId: number, r1: number, c1: number, r2: number, c2: number): Promise<void>;
  /** `wave` staggers the clear: 0 is the match itself, higher values are further along a sweep. */
  animateClearMatches(gridId: number, matches: { row: number; col: number; wave?: number }[]): Promise<void>;
  /**
   * Where each gem in `cols` is right now, keyed by item id. Read it BEFORE the model
   * moves anything — the grid rebuilds a gem's object on every cell change, and the
   * item id is all that survives.
   */
  captureGemPositions(gridId: number, cols: ReadonlySet<number>): Map<number, GemPosition>;
  /** Flies every gem in `cols` to its current cell, from wherever it actually is. */
  reconcileColumns(gridId: number, cols: ReadonlySet<number>, captured: Map<number, GemPosition>): Promise<void>;
}
