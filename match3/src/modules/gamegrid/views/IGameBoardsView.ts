import type { IGridView } from "@gamebyte/gamelabsjs";

/** A gem's world position, captured before the grid rebuilt its object. */
export type GemPosition = { x: number; y: number; z: number };

export interface IGameBoardsView extends IGridView {
  /** The `PointerEvent` is forwarded so the controller can tell a swipe from a tap. */
  setCellPointerDownHandler(handler: ((gridId: number, col: number, row: number, event: PointerEvent) => void) | null): void;
  updateGemSelection(gridId: number, selected: { col: number; row: number } | null): void;
  animateInvalidSwap(gridId: number, r1: number, c1: number, r2: number, c2: number): Promise<void>;
  animateValidSwap(gridId: number, r1: number, c1: number, r2: number, c2: number): Promise<void>;
  /** Gems to pulse white — boosters holding until their surroundings fill. */
  setBlinking(gridId: number, cells: { row: number; col: number }[]): void;
  /**
   * Bolts from a swapped cookie to every gem it is taking. Resolves ON IMPACT, so the
   * caller clears them exactly when the bolts land.
   */
  animateCookieBeams(
    gridId: number,
    from: { row: number; col: number },
    targets: { row: number; col: number }[],
    /** Flight time for this volley. Defaults to `cookieBeam.strikeSec`. */
    strikeSec?: number
  ): Promise<void>;
  /** A growing, fading ring on each swapped cell — the contact. Decoration only. */
  animateSwapPulse(gridId: number, cells: { row: number; col: number }[]): void;
  /**
   * Grows a newly created special into place over the pop's own duration, so it forms
   * as the match that earned it vanishes. Decoration only.
   */
  animateSpecialSpawn(gridId: number, at: { row: number; col: number }): void;
  /**
   * The white shockwave a firing stripe throws both ways along its line, on past the
   * screen edge. Decoration only — nothing waits for it.
   */
  animateStripeWave(gridId: number, at: { row: number; col: number }, alongRow: boolean): void;
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
