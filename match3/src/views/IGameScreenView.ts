import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IGameScreenView extends IScreenView {
  setScore(score: number): void;
  setGoal(cleared: number, goal: number): void;
  onSettingsTapped(cb: () => void): Unsubscribe;
}
