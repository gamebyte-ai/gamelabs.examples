import type { IGridView } from "@gamebyte/gamelabsjs";

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
    strikeSec?: number,
    /** Holds the volley back, for a sweep spaced finer than the timer's resolution. */
    delaySec?: number
  ): Promise<void>;
  /**
   * The flash a blast throws over these cells: grows while it fades in and then out.
   * `delaySec` holds it back, so a blast reached later in a sweep lights up on its own step.
   */
  animatePopLight(gridId: number, cells: { row: number; col: number }[], delaySec?: number): void;
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
  /**
   * Whether this cell's gem owns the cell but has not arrived in it yet — still above the
   * playable window. Such a gem is not a target for anything.
   */
  isAboveBoard(gridId: number, row: number, col: number): boolean;
  /**
   * Floats the score up off these cells. Decoration only.
   *
   * `delaySec` holds the labels back by that much, so a sweep spaced finer than the timer's
   * resolution — several steps landing in one frame — still shows them one at a time.
   */
  showScoreText(gridId: number, cells: { row: number; col: number }[], delaySec?: number): void;
  /**
   * Resolves once nothing on the board is falling. The board's clear → fall → settle
   * order is built on this: no match is looked for while a gem is still in the air.
   */
  waitForBoardAtRestAsync(): Promise<void>;
  /** `wave` staggers the clear: 0 is the match itself, higher values are further along a sweep. */
  animateClearMatches(gridId: number, matches: { row: number; col: number; wave?: number }[], delaySec?: number): Promise<void>;
  /**
   * Registers the drop for every gem in `cols` that is not already where it belongs.
   *
   * No snapshot is passed in any more. A gem whose cell changed keeps its rendered
   * position across the object rebuild the grid does on every cell change, so by the time
   * this runs it is already in the right place; only `spawned` gems have to be lifted.
   */
  reconcileColumns(
    gridId: number,
    cols: ReadonlySet<number>,
    /** Items refill has just created: only these enter from above the column. */
    spawned: ReadonlySet<number>
  ): Promise<void>;
}
