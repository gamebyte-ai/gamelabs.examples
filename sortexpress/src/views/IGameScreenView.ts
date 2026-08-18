import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";

/** The single boot HUD screen: title + tap-to-start prompt over the backdrop. */
export interface IGameScreenView extends IScreenView {
  /** Fired when the player taps to start. */
  onTap(cb: () => void): Unsubscribe;
}
