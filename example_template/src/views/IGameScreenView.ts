import type { IScreenView } from "@gamebyte/gamelabsjs";

export interface IGameScreenView extends IScreenView {
  setTitle(title: string): void;
}
