import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IGameScreenView extends IScreenView {
  setScore(score: number): void;
  setBest(best: number): void;
  showGameOver(visible: boolean): void;
  onSettingsTapped(cb: () => void): Unsubscribe;
  onRestartTapped(cb: () => void): Unsubscribe;
}
