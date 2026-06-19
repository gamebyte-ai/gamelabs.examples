import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { BoosterPanelState } from "../constants/BoosterPanelState";
import type { BoosterType } from "../constants/BoosterType";

/**
 * Snapshot of the combo state pushed to the view by the HUD
 * controller. The view derives the label text + per-circle colours
 * from these two numbers + config.
 */
export interface ComboHudState {
  /** 0 = inactive (label hidden, all circles inactive colour);
   *  1 = "COMBO READY"; 2+ = "COMBO Xn". */
  readonly level: number;
  /** 0..`config.combo.maxMoves`. Circles at indices `[0, movesRemaining)`
   *  render in the active colour, the rest in the inactive colour. */
  readonly movesRemaining: number;
}

/**
 * Snapshot of the booster panel state pushed to the view by the
 * HUD controller. The view derives button alpha / hit-test state
 * + progress-bar fill from these.
 */
export interface BoosterPanelHudState {
  readonly state: BoosterPanelState;
  /** 0..`config.booster.stagesPerCharge`. Drives the progress bar
   *  fill width while Charging. */
  readonly stagesFilled: number;
  /** Text shown in place of the progress bar while Ready
   *  ("CHOOSE ONE!" vs "NO MOVES LEFT, USE BOOSTER!"). `null`
   *  hides the label — the controller passes `null` while Charging
   *  or Selecting (the bar shows in Charging; nothing shows in
   *  Selecting). */
  readonly readyLabel: string | null;
  /** While in Selecting, the booster type that's pending a target
   *  pick. The view scales this button up, shows the floating X
   *  cancel button over it, and dims the others. `null` outside
   *  Selecting. */
  readonly selectedBooster: BoosterType | null;
  /** Whole-panel non-interactability gate — true after the game
   *  has ended (TimeUp / GameOver). View suppresses button taps,
   *  hides the X, and suppresses the ready label regardless of the
   *  underlying `state`. */
  readonly disabled: boolean;
}

/**
 * Game screen surface in the Pixi HUD layer. Owns the corner score
 * + time labels, top-centre combo widget, bottom booster panel +
 * progress bar, and the centered end-state label the controller
 * toggles on game-over.
 */
export interface IGameScreenView extends IScreenView {
  /** Pre-formatted score string (e.g. `"Score: 42"`). The controller
   *  owns the prefix and formatting; the view just renders. */
  setScoreText(text: string): void;
  /** Pre-formatted time string (e.g. `"01:23"`). */
  setTimeText(text: string): void;
  /** Push the combo state into the top-centre widget. The view
   *  derives the label text + circle colours from this. The combo
   *  visuals are hidden while {@link setBoosterPrompt} is active —
   *  the state is still latched so the combo reappears in its
   *  correct shape when the prompt clears. */
  setComboState(state: ComboHudState): void;
  /** Show a booster-instruction prompt in the combo widget's
   *  position (top centre). While `text` is non-null, the combo
   *  label + circles are hidden and the prompt label shows in
   *  their place. `null` clears the prompt and restores the combo
   *  to its latched state. */
  setBoosterPrompt(text: string | null): void;
  /** Push the booster panel state. The view styles the buttons
   *  (active / dim), sets their hit-test eligibility, and draws the
   *  progress-bar fill from `stagesFilled`. The bar hides while in
   *  Ready (buttons take the focus instead). */
  setBoosterPanelState(state: BoosterPanelHudState): void;
  /** Fires when the player taps any of the booster buttons while
   *  the panel is in Ready. The HUD controller chooses the next
   *  transition based on the booster type — target-selection
   *  boosters (Hammer / UnitBlock) call `selectBooster(type)`;
   *  instant boosters (TrayRefresh) run their mechanic and then
   *  `consume()`. */
  onBoosterActivated(callback: (type: BoosterType) => void): Unsubscribe;
  /** Fires when the player taps the floating X over the selected
   *  booster while in Selecting. The controller calls
   *  `BoosterPanelModel.cancelSelection()`. */
  onBoosterCancelled(callback: () => void): Unsubscribe;
  /** Set the synchronised horizontal shake offset applied to the
   *  combo widget's three circles. The HUD controller drives the
   *  decaying sin externally; this method just applies the current
   *  offset to the circles' container. `0` snaps them back. */
  setComboShakeOffset(offsetX: number): void;
  /** Show / hide the centered end-state label. `null` hides it; a
   *  non-null appearance shows the given text in the given colour
   *  (applied via container tint, the base label is white). */
  setEndStateLabel(appearance: { readonly text: string; readonly color: number } | null): void;
}
