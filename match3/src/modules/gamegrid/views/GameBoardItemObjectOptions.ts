import type { RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObjectOptions } from "@gamebyte/gamelabsjs";

export class GameBoardItemObjectOptions extends GridItemObjectOptions {
  public readonly gemType: number;

  public constructor(itemId: number, gridPreset: RectGridPreset, gemType: number) {
    super(itemId, gridPreset);
    this.gemType = gemType;
  }
}
