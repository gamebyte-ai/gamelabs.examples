import type { RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObjectOptions } from "@gamebyte/gamelabsjs";

export class GameBoardItemObjectOptions extends GridItemObjectOptions {
  public readonly value: number;

  public constructor(itemId: number, gridPreset: RectGridPreset, value: number) {
    super(itemId, gridPreset);
    this.value = value;
  }
}
