import type { Kind } from "./models/IGameModel.js";

/** HUD texture asset ids (namespaced), loaded via the AssetManager pipeline in
 * FactoryMatchApp.loadAssets and resolved in the screen view with
 * `assetLoader.getAsset(...)`. */
export enum FactoryMatchAssetIds {
  // HUD chrome.
  TimerBg = "FactoryMatch.TimerBg",
  GoalBg = "FactoryMatch.GoalBg",
  MultiplierBg = "FactoryMatch.MultiplierBg",
  // End-of-game banners.
  ResultAllClear = "FactoryMatch.ResultAllClear", // won
  ResultTimeIsUp = "FactoryMatch.ResultTimeIsUp", // lost — countdown hit zero
  ResultGameOver = "FactoryMatch.ResultGameOver", // lost — tray full
  // Goal chip icons (2D, per kind).
  GoalIconDice = "FactoryMatch.GoalIconDice",
  GoalIconRadio = "FactoryMatch.GoalIconRadio",
  GoalIconBillard = "FactoryMatch.GoalIconBillard",
  // Bottom-bar booster buttons (passive = charging, active = usable).
  BoosterFan = "FactoryMatch.BoosterFan",
  BoosterFanActive = "FactoryMatch.BoosterFanActive",
  BoosterSpring = "FactoryMatch.BoosterSpring",
  BoosterSpringActive = "FactoryMatch.BoosterSpringActive",
  // Start-of-game countdown numbers (3, 2, 1).
  CountdownNum1 = "FactoryMatch.CountdownNum1",
  CountdownNum2 = "FactoryMatch.CountdownNum2",
  CountdownNum3 = "FactoryMatch.CountdownNum3",
}

/** Goal-chip icon per kind. Kinds without an icon render their count only. */
export const GOAL_ICON_BY_KIND: Partial<Record<Kind, FactoryMatchAssetIds>> = {
  dice: FactoryMatchAssetIds.GoalIconDice,
  radio: FactoryMatchAssetIds.GoalIconRadio,
  billardball: FactoryMatchAssetIds.GoalIconBillard,
};
