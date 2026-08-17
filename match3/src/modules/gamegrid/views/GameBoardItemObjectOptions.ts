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

/** Look of the booster mark — see `Match3Config.booster`. */
export interface GemBoosterOptions {
  readonly label: string;
  readonly labelColor: number;
  readonly labelScale: number;
  /** How far the waiting pulse goes, 0..1 — 1 is the mask at full strength. */
  readonly blinkStrength: number;
  /** Colour the pulse fills the gem's silhouette with. */
  readonly blinkColor: number;
}

/** Look of the ring around a picked gem — see `Match3Config.selection`. */
export interface GemSelectionOptions {
  readonly enabled: boolean;
  readonly color: number;
  readonly scale: number;
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
  public readonly booster: GemBoosterOptions;
  public readonly selection: GemSelectionOptions;
  /** Cells a merged bomb+stripe covers — how many times oversize to draw it. */
  public readonly giantSpanCells: number;
  /**
   * World Z of the board's top edge, or null for no mask.
   *
   * The gem clips against it, so the reserve stacked above the playable window stays out of
   * sight. Carried per item because the clip has to be on the GEM's material and nothing
   * else: as a renderer-wide plane it also cut the backdrop art, the frame and the stripe's
   * shockwave, all of which live outside the board on purpose.
   */
  public readonly maskTopZ: number | null;

  public constructor(
    itemId: number,
    gridPreset: RectGridPreset,
    gemType: number,
    shadow: GemShadowOptions,
    special: GemSpecial,
    stripe: GemStripeOptions,
    booster: GemBoosterOptions,
    selection: GemSelectionOptions,
    giantSpanCells: number,
    maskTopZ: number | null
  ) {
    super(itemId, gridPreset);
    this.gemType = gemType;
    this.shadow = shadow;
    this.special = special;
    this.stripe = stripe;
    this.booster = booster;
    this.selection = selection;
    this.giantSpanCells = giantSpanCells;
    this.maskTopZ = maskTopZ;
  }
}
