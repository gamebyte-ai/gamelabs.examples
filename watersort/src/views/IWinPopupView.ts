import type { IPopupView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IWinPopupView extends IPopupView {
  setResult(level: number, moves: number): void;
  onNextLevel(cb: () => void): Unsubscribe;
}
