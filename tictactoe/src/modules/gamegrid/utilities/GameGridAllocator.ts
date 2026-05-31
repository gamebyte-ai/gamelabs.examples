import { DefaultGridAllocator, type GridItem, type IGridAllocator } from "@gamebyte/gamelabsjs";
import { GameItem } from "../models/GameItem.js";
import { Team } from "../../../constants/Team.js";

export class GameGridAllocator extends DefaultGridAllocator implements IGridAllocator {
  public override createItem(options: { id?: number; team?: Team }): GridItem {
    return new GameItem(options?.id ?? 0, options?.team ?? Team.X);
  }
}
