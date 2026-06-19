/**
 * Namespaced identifiers for every asset the example loads through
 * the framework's `AssetManager`. Used by {@link BlockPuzzleApp.loadAssets}
 * to enqueue each asset and by views to retrieve the loaded texture
 * via `assetLoader.getAsset(...)`.
 *
 * Currently HUD-only: booster button icons, drawn as monochrome
 * SVGs so the view can tint them via the configured label colour.
 */
export enum BlockPuzzleAssetIds {
  HammerIcon = "BlockPuzzle.HammerIcon",
  UnitBlockIcon = "BlockPuzzle.UnitBlockIcon",
  TrayRefreshIcon = "BlockPuzzle.TrayRefreshIcon",
}
