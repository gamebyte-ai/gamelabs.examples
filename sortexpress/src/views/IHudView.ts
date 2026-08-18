import type { IScreenView } from "@gamebyte/gamelabsjs";

/** Gameplay HUD overlay: the top-of-screen countdown timer chip (transparent
 * elsewhere, so the 3D board shows through + stays interactive). */
export interface IHudView extends IScreenView {
  /** Update the countdown display. `remainingSeconds` drives the MM:SS text;
   * `fraction01` (1 = full, 0 = empty) drives the low-time colour switch. */
  setTime(remainingSeconds: number, fraction01: number): void;

  /** Show the timed-out state (a "Time's Up" banner). */
  showTimeout(): void;

  /** Show the win state (a "You Win" banner). */
  showWin(): void;

  /** Register a listener for taps on the broom booster button. */
  onBroom(cb: () => void): () => void;

  /** The broom button's centre in screen NDC — the board flies items to it. */
  broomScreenNdc(): { x: number; y: number };

  /** Register a listener for taps on the shuffle booster button. */
  onShuffle(cb: () => void): () => void;

  /** Update the shuffle button's remaining-count badge (greys it at 0). */
  setShuffleCount(count: number): void;

  /** Play the hat's move-to-gather-and-back animation (timed to the board shuffle).
   * `ndc` is the gather point in screen NDC (x,y ∈ [-1,1]). */
  playShuffle(ndc: { x: number; y: number }): void;

  /** Update the broom's remaining-count badge (also greys the button at 0). */
  setBroomCount(count: number): void;

  /** Show the end card (CTA) over the board — called when the game ends. */
  showEndCard(): void;
}
