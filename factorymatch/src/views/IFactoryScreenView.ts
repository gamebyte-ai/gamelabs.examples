import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

/** End-of-game banner to show. */
export type GameResult = "allClear" | "timeUp" | "gameOver";

/** HUD view — UI only: score, countdown timer, goal chips and the end-of-game
 * banner. The 3D pile + slot rack live in the World view. */
export interface IFactoryScreenView extends IScreenView {
  /** Set the player's cash (the single top income display, shown as $N). */
  setCash(cash: number): void;
  // Timer + score are no longer shown; these are kept as no-ops so the timer
  // mechanic (lose-on-time) can still drive without a HUD element.
  setScore(score: number): void;
  setTime(text: string): void;
  setTimeWarning(active: boolean): void;
  setGoal(index: number, count: number): void;
  pulseGoal(index: number): void;
  /** Update the combo multiplier badge: `level` is the x-factor (x1, x2, …) and
   * `fill` (0→1) the progress ring around it. */
  setCombo(level: number, fill: number): void;
  /** Update the charge rings around the boosters (0→1 each); a full ring means
   * the booster is usable (its icon also un-dims). */
  setBoosterCharge(fanFill: number, springFill: number): void;
  /** Pop the spring booster's scale to prompt its use (a full tray held open by a
   * charged spring instead of ending the game). */
  pulseSpringBooster(): void;
  showResult(result: GameResult): void;
  hideBanner(): void;
  /** Play the 3-2-1-Go intro, calling `onDone` when it finishes. */
  playCountdown(onDone: () => void): void;
  /** Register a handler for taps on the fan booster button. */
  onFanTap(cb: () => void): Unsubscribe;
  /** Register a handler for taps on the spring booster button. */
  onSpringTap(cb: () => void): Unsubscribe;
}
