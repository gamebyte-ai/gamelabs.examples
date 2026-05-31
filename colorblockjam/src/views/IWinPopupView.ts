import type { IPopupView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IWinPopupView extends IPopupView {
  /** Sets the level number shown at the top of the popup. */
  setLevelInfo(levelNumber: number, totalLevels: number): void;

  /**
   * Swaps the primary button's label and body copy between the
   * normal "Next Level" flow and the "last level cleared" flow.
   */
  setIsFinalLevel(isFinal: boolean): void;

  /** Emits when the primary (Next Level / Play Again) button is pressed. */
  onAdvance(cb: () => void): Unsubscribe;
}
