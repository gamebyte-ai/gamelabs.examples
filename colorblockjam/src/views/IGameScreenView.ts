import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * HUD overlay for the in-game screen: title/subtitle in the top-left
 * and a settings gear button in the top-right.
 */
export interface IGameScreenView extends IScreenView {
  setTitle(title: string): void;
  setSubtitle(subtitle: string): void;
  /** Fires when the settings gear button is tapped. */
  onSettingsTapped(cb: () => void): Unsubscribe;
}
