import { GridItem } from "@gamebyte/gamelabsjs";

/**
 * One placed block on the hex grid. Carries the color index that drives
 * matching/merging logic in `SortOperations` / `SortingManager`. Multiple
 * `BlockItem` instances stacked on a cell form the cell's column visual.
 */
export class BlockItem extends GridItem {
  public readonly colorIndex: number;

  public constructor(itemId: number, colorIndex: number) {
    super(itemId);
    this.colorIndex = colorIndex;
  }
}
