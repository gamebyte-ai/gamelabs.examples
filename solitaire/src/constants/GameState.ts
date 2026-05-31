/**
 * Game lifecycle states. The value held by `GameStateModel` is one of
 * these; the enum lives here (no class behaviour) so it sits alongside
 * the other game-wide constant enums (Suit, Rank, SlotType).
 */
export enum GameState {
  /** Initial-deal animation is running. Timer is paused; player
   *  input is blocked (the view's `isAnimating` gate covers it). */
  Dealing = "dealing",
  /** Deal complete; player can interact and the timer ticks. */
  Playing = "playing",
  /** Countdown reached zero. Player input is blocked at the
   *  controller layer; the HUD shows a "Time is Over" label.
   *  Distinct from a future losing state so the two can carry
   *  different end-of-game messaging and side-effects. */
  TimeOver = "timeOver",
  /** All four foundations are complete (A→K of each suit). Player
   *  input is blocked, the timer freezes, and the HUD shows a
   *  "You Win!" label over the final board layout. */
  Won = "won",
}
