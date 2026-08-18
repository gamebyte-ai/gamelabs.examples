import type { IView } from "@gamebyte/gamelabsjs";

/** The 3D board (shelves of object slots) with drag-and-drop of front-layer items. */
export interface IBoardView extends IView {
  /** Per-frame tick (seconds) — eases the dragged item toward the pointer. */
  update(dt: number): void;

  /** Enable/disable player interaction (drag). Called with `false` on time-out. */
  setInteractive(enabled: boolean): void;

  /** Register a listener fired once when the board is fully cleared (win). */
  onWin(cb: () => void): () => void;

  /** Register a listener fired once when time runs out with the board unsolved
   * (fires only after any in-flight match/broom animation settles). */
  onLose(cb: () => void): () => void;

  /** Tell the board the countdown hit zero — it freezes input and resolves the
   * win/lose result once any running animation finishes. */
  notifyTimeUp(): void;

  /** Broom booster: vacuum 3 identical on-screen items into the broom + clear them.
   * `targetNdc` is the broom button's screen position (items fly to under it).
   * Returns true if a sweep actually ran (false = no 3 identical items / busy). */
  activateBroom(targetNdc?: { x: number; y: number }): boolean;

  /** Shuffle booster: re-scatter all items across their occupied slots. Returns
   * true if a shuffle ran (false = nothing to shuffle / busy). */
  activateShuffle(): boolean;

  /** The shuffle gather point projected to screen NDC (x,y ∈ [-1,1]) — where the
   * HUD should send the hat so it sits over the gathered items. */
  gatherScreenNdc(): { x: number; y: number };
}
