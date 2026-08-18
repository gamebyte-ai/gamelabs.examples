import type { IScreenView } from "@gamebyte/gamelabsjs";

/** The single boot HUD screen: title + tap-to-start prompt over the backdrop. */
export interface IGameScreenView extends IScreenView {
  /** Set the title + tagline text. */
  setText(title: string, tagline: string): void;
}
