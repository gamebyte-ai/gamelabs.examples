import type { IPopupView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IGameOverPopupView extends IPopupView {
  setWave(wave: number): void;
  onPlayAgain(cb: () => void): Unsubscribe;
}
