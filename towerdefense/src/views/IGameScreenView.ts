import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { TowerTypeId } from "../constants/TowerTypeDef.js";

export interface IGameScreenView extends IScreenView {
  setGenerateLevelHandler(handler: (() => void) | null): void;
  setBuyTowerHandler(handler: ((towerType: TowerTypeId) => void) | null): void;
  updateGold(amount: number): void;
  updateTowerAffordability(currentGold: number): void;
  updateStats(kills: number, waveNumber: number): void;
  onSettingsTapped(cb: () => void): Unsubscribe;
}
