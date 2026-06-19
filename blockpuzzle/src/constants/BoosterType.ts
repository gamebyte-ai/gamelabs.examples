/**
 * The three booster slots in the bottom-of-screen panel. Stable
 * string ids so the model + HUD can address each booster without
 * caring about display order. The HUD itself lays them out left to
 * right in {@link BOOSTER_DISPLAY_ORDER}.
 */
export enum BoosterType {
  Hammer = "hammer",
  UnitBlock = "unitBlock",
  TrayRefresh = "trayRefresh",
}

/**
 * Left-to-right order the HUD renders the booster buttons. Keep
 * this in sync with `BlockPuzzleConfig.booster.buttons` so each
 * entry has a config record.
 */
export const BOOSTER_DISPLAY_ORDER: readonly BoosterType[] = [
  BoosterType.Hammer,
  BoosterType.UnitBlock,
  BoosterType.TrayRefresh,
];
