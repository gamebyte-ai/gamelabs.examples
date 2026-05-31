import { GridItem } from "@gamebyte/gamelabsjs";
import type { TowerTypeId } from "../../../constants/TowerTypeDef.js";

/**
 * A placed tower on the tower-defense board. Extends the module's
 * {@link GridItem} with the tower type so the creator/view know what
 * mesh to build.
 */
export class GameBoardItem extends GridItem {
  public readonly towerType: TowerTypeId;

  public constructor(itemId: number, towerType: TowerTypeId) {
    super(itemId);
    this.towerType = towerType;
  }
}
