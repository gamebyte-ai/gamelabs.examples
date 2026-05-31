import { GridItem } from "@gamebyte/gamelabsjs";

/**
 * One cell-occupant of a multi-cell {@link Block}. All `BlockItem`s
 * belonging to the same logical block share the same `groupId` (= the
 * block's id) so the operations layer can identify them as part of one
 * shape and move/clear them together. `colorIndex` mirrors the parent
 * block's color so collision/door-matching rules can read it directly
 * off the cell's item without dereferencing the model.
 */
export class BlockItem extends GridItem {
  public readonly groupId: number;
  public readonly colorIndex: number;

  public constructor(itemId: number, groupId: number, colorIndex: number) {
    super(itemId);
    this.groupId = groupId;
    this.colorIndex = colorIndex;
  }
}
