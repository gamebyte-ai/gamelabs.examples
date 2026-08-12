export enum Match3AssetIds {
  GemRed = "Match3.GemRed",
  GemBlue = "Match3.GemBlue",
  GemGreen = "Match3.GemGreen",
  GemYellow = "Match3.GemYellow",
  GemPurple = "Match3.GemPurple",
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
