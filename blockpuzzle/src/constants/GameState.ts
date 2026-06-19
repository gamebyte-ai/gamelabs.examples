/**
 * Top-level game state. Drives the drag-enabled gate on the view,
 * the centered end-state label, and the booster ready-label
 * suppression after an end state.
 *
 * `GameOver` and `TimeUp` are independent terminal states — the
 * no-moves rule and the countdown-to-zero rule each pick their
 * own. Callers must guard transitions on `state === Playing` so
 * one terminal state doesn't overwrite the other.
 */
export enum GameState {
  Playing = "playing",
  /** Every tray piece is unplaceable on the current grid and no
   *  booster is queued. Drag is disabled. */
  GameOver = "gameOver",
  /** The countdown timer reached zero. Independent from
   *  {@link GameOver}: the "NO MOVES LEFT, USE BOOSTER!" prompt is
   *  suppressed and the centered overlay reads "TIME UP!". */
  TimeUp = "timeUp",
}
