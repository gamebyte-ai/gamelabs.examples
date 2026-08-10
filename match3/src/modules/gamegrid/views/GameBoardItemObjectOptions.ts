import type { RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObjectOptions } from "@gamebyte/gamelabsjs";
import type { GemSpecial } from "../models/GameBoardItem.js";

/** Tuning for the soft shadow behind a gem — see `Match3Config.gemShadow`. */
export interface GemShadowOptions {
  readonly opacity: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly softness: number;
}

/** Look of the stripe marks on a special gem — see `Match3Config.special`. */
export interface GemStripeOptions {
  readonly stripeColor: number;
  readonly stripeOpacity: number;
  readonly stripeThickness: number;
  readonly stripeGap: number;
}

export class GameBoardItemObjectOptions extends GridItemObjectOptions {
  public readonly gemType: number;
  /**
   * Carried per item because the grid module constructs item objects itself, with no
   * DI access — routing the values through the options is what keeps them on the
   * config instance, and therefore overridable from `game-config.json`.
   */
  public readonly shadow: GemShadowOptions;
  /** What this gem does when cleared; also what the stripe marks below depict. */
  public readonly special: GemSpecial;
  public readonly stripe: GemStripeOptions;

  public constructor(
    itemId: number,
    gridPreset: RectGridPreset,
    gemType: number,
    shadow: GemShadowOptions,
    special: GemSpecial,
    stripe: GemStripeOptions
  ) {
    super(itemId, gridPreset);
    this.gemType = gemType;
    this.shadow = shadow;
    this.special = special;
    this.stripe = stripe;
  }
}
