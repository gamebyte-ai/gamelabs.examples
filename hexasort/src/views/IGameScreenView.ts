import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IGameScreenView extends IScreenView {
  onSettingsTapped(callback: () => void): Unsubscribe;
}
