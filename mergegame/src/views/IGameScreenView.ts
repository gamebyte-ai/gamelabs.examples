import type { IScreenView } from "@gamebyte/gamelabsjs";

/** HUD chrome contract — just the level label. Gameplay lives in `IGameView`. */
export interface IGameScreenView extends IScreenView {
  setLevel(level: number): void;
}
