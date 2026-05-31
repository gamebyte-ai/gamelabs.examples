import type { IView } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";

/**
 * The cluster grid — placed bubbles in the hex matrix plus the
 * jelly-wobble snap shake that ripples through neighbouring bubbles
 * after a fired bubble lands. The view tracks the layout's logical
 * descend offset for game-logic purposes (trajectory, loss check)
 * but visually lags behind through `playDescent` /
 * `tickGridAnimation` so the descent reads as a smooth slide
 * instead of an instant snap.
 */
export interface IBubbleGridView extends IView {
  setBubble(row: number, col: number, color: BubbleColor): void;
  removeBubble(row: number, col: number): void;
  playSnapShake(row: number, col: number): void;
  /**
   * Trigger the smooth-descent animation for `rows` row pitches.
   * Multi-row descents (e.g. auto-descent after a pop) are stacked
   * into a single continuous slide instead of N separate steps.
   */
  playDescent(rows: number): void;
  /**
   * Snap visual state to the current layout (instant, no
   * animation). Called on level load + per-level width changes;
   * rebuilds cell outlines + ceiling strip, clears in-flight
   * shakes, resets the descent visual offset.
   */
  applyLayoutReset(): void;
  /** Per-frame tick for descent + snap-shake animation. */
  tickGridAnimation(dt: number): void;
}
