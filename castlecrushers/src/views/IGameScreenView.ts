import type { IScreenView } from "@gamebyte/gamelabsjs";

/** HUD view — UI only. Game objects live in the World view (`GameView`). */
export interface IGameScreenView extends IScreenView {
  setAmmo(ammoLeft: number): void;
  showBanner(text: string): void;
  hideBanner(): void;
}
