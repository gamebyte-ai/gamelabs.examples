/** HUD texture asset ids (namespaced), loaded via the AssetManager pipeline in
 * FactoryMatchApp.loadAssets and resolved in the screen view with
 * `assetLoader.getAsset(...)`. */
export enum FactoryMatchAssetIds {
  // Placeholder UI shapes (white SVGs, tinted in code). These are the shapes the
  // HUD draws — the cash pill uses the pill, combo badge + booster discs the circle,
  // goal chips the panel, and each goal icon its primitive shape. Swap the SVG files
  // in assets/ui to re-skin; the screen view just tints + scales them.
  UiPill = "FactoryMatch.UiPill",
  UiCircle = "FactoryMatch.UiCircle",
  UiPanel = "FactoryMatch.UiPanel",
  ShapeCube = "FactoryMatch.ShapeCube",
  ShapeSphere = "FactoryMatch.ShapeSphere",
  ShapeCylinder = "FactoryMatch.ShapeCylinder",
  ShapeCuboid = "FactoryMatch.ShapeCuboid",
  ShapePyramid = "FactoryMatch.ShapePyramid",
  // End-of-game result is drawn as text in the screen view — no banner art.
  // Start-of-game countdown is drawn as text in the screen view — no number art.
}
