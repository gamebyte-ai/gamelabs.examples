import { GridItem } from "@gamebyte/gamelabsjs";

/**
 * Per-board item model for Match-3: unique `itemId` (gamegrid) + `gemType` for match/color logic.
 */
export class GameBoardItem extends GridItem {
  public readonly gemType: number;

  public constructor(itemId: number, gemType: number) {
    super(itemId);
    this.gemType = gemType;
  }
}
