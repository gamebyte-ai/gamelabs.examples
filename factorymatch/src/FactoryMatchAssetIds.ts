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
  // Bottom-bar booster buttons.
  BoosterFan = "FactoryMatch.BoosterFan",
  BoosterSpring = "FactoryMatch.BoosterSpring",
}

/** Goal-chip icon per kind. Kinds without an icon render their count only. */
export const GOAL_ICON_BY_KIND: Partial<Record<Kind, FactoryMatchAssetIds>> = {
  dice: FactoryMatchAssetIds.GoalIconDice,
  radio: FactoryMatchAssetIds.GoalIconRadio,
  billardball: FactoryMatchAssetIds.GoalIconBillard,
};
