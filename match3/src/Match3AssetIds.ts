import { GemSpecial } from "./modules/gamegrid/models/GameBoardItem.js";

export enum Match3AssetIds {
  GemRed = "Match3.GemRed",
  GemBlue = "Match3.GemBlue",
  GemGreen = "Match3.GemGreen",
  GemYellow = "Match3.GemYellow",
  GemPurple = "Match3.GemPurple",
  GemRedBomb = "Match3.GemRedBomb",
  GemBlueBomb = "Match3.GemBlueBomb",
  GemGreenBomb = "Match3.GemGreenBomb",
  GemYellowBomb = "Match3.GemYellowBomb",
  GemPurpleBomb = "Match3.GemPurpleBomb",
  GemRedStripeRow = "Match3.GemRedStripeRow",
  GemBlueStripeRow = "Match3.GemBlueStripeRow",
  GemGreenStripeRow = "Match3.GemGreenStripeRow",
  GemYellowStripeRow = "Match3.GemYellowStripeRow",
  GemPurpleStripeRow = "Match3.GemPurpleStripeRow",
  GemRedStripeCol = "Match3.GemRedStripeCol",
  GemBlueStripeCol = "Match3.GemBlueStripeCol",
  GemGreenStripeCol = "Match3.GemGreenStripeCol",
  GemYellowStripeCol = "Match3.GemYellowStripeCol",
  GemPurpleStripeCol = "Match3.GemPurpleStripeCol",
  /** The cookie is colourless, so it has one face rather than one per colour. */
  Cookie = "Match3.Cookie",
  /** The frame drawn around the board. */
  BoardFrame = "Match3.BoardFrame",
  /** Full-screen backdrop behind the board. */
  Background = "Match3.Background",
  /** Radial glow, used for the flash a blast throws. */
  Light = "Match3.Light",
  SfxSelect = "Match3.SfxSelect",
  SfxSwap = "Match3.SfxSwap",
  SfxWrong = "Match3.SfxWrong",
  SfxPop = "Match3.SfxPop",
  MusicBg = "Match3.MusicBg",
}

/** Ordered by gemType index (0–4), matching Match3Config.GEM_PALETTE order. */
export const GEM_ASSET_IDS_BY_TYPE: readonly string[] = [
  Match3AssetIds.GemRed,
  Match3AssetIds.GemBlue,
  Match3AssetIds.GemGreen,
  Match3AssetIds.GemYellow,
  Match3AssetIds.GemPurple,
];

/**
 * The gem art, one texture per colour AND per special — the bomb's star, the stripe's
 * elongated crystal, each already drawn in that colour.
 *
 * Before this, a gem was one texture per colour and everything that marked it as special
 * was drawn over the top at runtime: stripe bars, the bomb's letter, the cookie's wedges.
 * The art now carries all of it, so the gem is a single quad again and those overlays are
 * gone.
 *
 * A cookie is absent on purpose: it is colourless, so {@link Match3AssetIds.Cookie} serves
 * every one of them.
 */
const GEM_SPECIAL_ASSET_IDS: Readonly<Record<number, readonly string[]>> = {
  [GemSpecial.Booster]: [
    Match3AssetIds.GemRedBomb,
    Match3AssetIds.GemBlueBomb,
    Match3AssetIds.GemGreenBomb,
    Match3AssetIds.GemYellowBomb,
    Match3AssetIds.GemPurpleBomb,
  ],
  [GemSpecial.StripedRow]: [
    Match3AssetIds.GemRedStripeRow,
    Match3AssetIds.GemBlueStripeRow,
    Match3AssetIds.GemGreenStripeRow,
    Match3AssetIds.GemYellowStripeRow,
    Match3AssetIds.GemPurpleStripeRow,
  ],
  [GemSpecial.StripedColumn]: [
    Match3AssetIds.GemRedStripeCol,
    Match3AssetIds.GemBlueStripeCol,
    Match3AssetIds.GemGreenStripeCol,
    Match3AssetIds.GemYellowStripeCol,
    Match3AssetIds.GemPurpleStripeCol,
  ],
};

/**
 * The texture for a gem of this colour in this state, or null if the art does not cover it.
 *
 * The giant merged item has no art of its own — it is built from the block it replaced — so
 * it falls back to the plain gem and the view scales it up.
 */
export function gemAssetId(gemType: number, special: GemSpecial): string | null {
  if (special === GemSpecial.ColorBomb) return Match3AssetIds.Cookie;

  const forSpecial = GEM_SPECIAL_ASSET_IDS[special];
  const ids = forSpecial ?? GEM_ASSET_IDS_BY_TYPE;
  return ids[gemType % ids.length] ?? null;
}
