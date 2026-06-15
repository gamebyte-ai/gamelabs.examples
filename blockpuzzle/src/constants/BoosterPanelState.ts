/**
 * Booster panel lifecycle. Three-state machine:
 *
 * - {@link Charging} — progress bar visible, filling per cleared
 *   row / column. Booster buttons dim. Default state.
 * - {@link Ready} — one activation available. Progress bar hidden,
 *   buttons active. The ready-state label ("CHOOSE ONE!" /
 *   "NO MOVES LEFT, USE BOOSTER!") takes the bar's spot.
 *   Tapping an instant booster (TrayRefresh) goes straight to
 *   Charging; tapping a target-selection booster (Hammer /
 *   UnitBlock) goes to Selecting.
 * - {@link Selecting} — target-selection booster pending. Selected
 *   booster scales up, a floating X cancel button appears over it,
 *   the other two boosters dim. Tray drag is disabled; the boards
 *   view enables grid-cell taps so the mechanic can pick a target.
 *   Either the mechanic completes (→ Charging) or the player taps
 *   the X (→ Ready).
 */
export enum BoosterPanelState {
  Charging = "charging",
  Ready = "ready",
  Selecting = "selecting",
}
