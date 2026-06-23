/** HUD texture asset ids (namespaced), loaded via the AssetManager pipeline in
 * FactoryMatchApp.loadAssets and resolved in the screen view with
 * `assetLoader.getAsset(...)`. */
export enum FactoryMatchAssetIds {
  TimerBg = "FactoryMatch.TimerBg",
  GoalBg = "FactoryMatch.GoalBg",
  MultiplierBg = "FactoryMatch.MultiplierBg",
  // End-of-game banners.
  ResultAllClear = "FactoryMatch.ResultAllClear", // won
  ResultTimeIsUp = "FactoryMatch.ResultTimeIsUp", // lost — countdown hit zero
  ResultGameOver = "FactoryMatch.ResultGameOver", // lost — tray full
}
