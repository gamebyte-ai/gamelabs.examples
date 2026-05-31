import { SlotType } from "../constants/SlotType";
import { Pile } from "./Pile";
import { FLUSH_STACK } from "../constants/StackingOffset";

export class StockPile extends Pile {
  public constructor(worldX: number, worldZ: number) {
    super(SlotType.Stock, worldX, worldZ, FLUSH_STACK);
  }

  public canPlace(): boolean {
    return false;
  }

  public canDragFrom(): boolean {
    return false;
  }
}
