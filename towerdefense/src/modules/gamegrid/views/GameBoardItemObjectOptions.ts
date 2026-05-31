import { GridItemObjectOptions, type RectGridPreset } from "@gamebyte/gamelabsjs";
import type { TowerTypeId } from "../../../constants/TowerTypeDef.js";

export class GameBoardItemObjectOptions extends GridItemObjectOptions {
  public readonly towerType: TowerTypeId;

  public constructor(itemId: number, gridPreset: RectGridPreset, towerType: TowerTypeId) {
    super(itemId, gridPreset);
    this.towerType = towerType;
  }
}
