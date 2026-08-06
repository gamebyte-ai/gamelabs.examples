import type { RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObjectOptions } from "@gamebyte/gamelabsjs";

/** Tuning for the soft shadow behind a gem — see `Match3Config.gemShadow`. */
export interface GemShadowOptions {
  readonly opacity: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly softness: number;
}

export class GameBoardItemObjectOptions extends GridItemObjectOptions {
  public readonly gemType: number;
  /**
   * Carried per item because the grid module constructs item objects itself, with no
   * DI access — routing the values through the options is what keeps them on the
   * config instance, and therefore overridable from `game-config.json`.
   */
  public readonly shadow: GemShadowOptions;

  public constructor(itemId: number, gridPreset: RectGridPreset, gemType: number, shadow: GemShadowOptions) {
    super(itemId, gridPreset);
    this.gemType = gemType;
    this.shadow = shadow;
  }
}
