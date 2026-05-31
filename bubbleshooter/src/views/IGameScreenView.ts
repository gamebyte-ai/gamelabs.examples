import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IGameScreenView extends IScreenView {
  onLevelChanged(cb: (levelId: string) => void): Unsubscribe;
  /**
   * Re-run OSC reposition against the latest screen size. Called from
   * the controller on every layout-changed event so power-up button
   * offsets that have been mutated against the new play-area
   * dimensions are picked up by the OnScreenControlsView (which only
   * repositions on its own `resize` call).
   */
  repositionOnScreenControls(): void;
}
