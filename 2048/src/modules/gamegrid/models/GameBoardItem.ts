import { GridItem } from "@gamebyte/gamelabsjs";

/**
 * Per-board item model for 2048: unique `itemId` (gamegrid) + `value` (tile face number, e.g. 2, 4, 8 ...).
 */
export class GameBoardItem extends GridItem {
  public readonly value: number;

  public constructor(itemId: number, value: number) {
    super(itemId);
    this.value = value;
  }
}
