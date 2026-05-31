import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IGameScreenView extends IScreenView {
  setScore(score: number): void;
  onSettingsTapped(cb: () => void): Unsubscribe;
}
