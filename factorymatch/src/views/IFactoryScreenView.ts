import type { IScreenView } from "@gamebyte/gamelabsjs";

/** HUD view — UI only: score and the win/lose banner. The slot rack is 3D, in the World view. */
export interface IFactoryScreenView extends IScreenView {
  setScore(score: number): void;
  showBanner(text: string): void;
  hideBanner(): void;
}
