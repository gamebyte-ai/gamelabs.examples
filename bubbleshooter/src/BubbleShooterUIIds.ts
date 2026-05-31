/**
 * Namespaced UI identifiers — both screen / popup IDs (consumed by
 * `UIEvents.createScreen` / `createPopup`) and OnScreenControl IDs
 * (consumed by `OnScreenControlManager`). All values live here to
 * prevent cross-imports of raw string IDs between the app, screen
 * controller, and any future input managers.
 */
export enum BubbleShooterUIIds {
  // Screen / popup ids.
  GameScreen = "BubbleShooter.GameScreen",

  // OnScreenControl ids — labels, buttons, badges.
  ScoreLabel = "BubbleShooter.ScoreLabel",
  WinLabel = "BubbleShooter.WinLabel",
  GameOverLabel = "BubbleShooter.GameOverLabel",
  BombButton = "BubbleShooter.BombButton",
  BombCountLabel = "BubbleShooter.BombCountLabel",
  FireballButton = "BubbleShooter.FireballButton",
  FireballCountLabel = "BubbleShooter.FireballCountLabel",
  SettingsButton = "BubbleShooter.SettingsButton",
  TargetButton = "BubbleShooter.TargetButton",
}
