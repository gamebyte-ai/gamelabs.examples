import { BubbleColor } from "./constants/BubbleColor";

export enum BubbleShooterAssetIds {
  BubbleRed = "BubbleShooter.BubbleRed",
  BubbleBlue = "BubbleShooter.BubbleBlue",
  BubbleGreen = "BubbleShooter.BubbleGreen",
  BubbleYellow = "BubbleShooter.BubbleYellow",
  BubblePurple = "BubbleShooter.BubblePurple",
  BubbleStone = "BubbleShooter.BubbleStone",
  /** Refresh-style icon framing the next-bubble preview (swap affordance). */
  SwapIcon = "BubbleShooter.SwapIcon",
  /** Bomb sprite for the world (held / flying bomb visual). */
  BombBubble = "BubbleShooter.BombBubble",
  /** Bomb sprite for the HUD button icon (same artwork, HUD texture type). */
  BombIcon = "BubbleShooter.BombIcon",
  /** Fireball sprite for the world (held / flying fireball visual). */
  FireballBubble = "BubbleShooter.FireballBubble",
  /** Fireball sprite for the HUD button icon. */
  FireballIcon = "BubbleShooter.FireballIcon",
  /** Gear sprite for the HUD settings button icon. */
  SettingsIcon = "BubbleShooter.SettingsIcon",
  /** Crosshair sprite for the HUD target / aim-aid toggle button. */
  TargetIcon = "BubbleShooter.TargetIcon",
  /** Procedurally synthesised SFX, registered as `AudioBuffer` assets. */
  SoundPop = "BubbleShooter.SoundPop",
  SoundSnap = "BubbleShooter.SoundSnap",
  SoundShoot = "BubbleShooter.SoundShoot",
  SoundBomb = "BubbleShooter.SoundBomb",
  SoundFireball = "BubbleShooter.SoundFireball",
  SoundSwap = "BubbleShooter.SoundSwap",
}

export const BUBBLE_COLOR_TO_ASSET_ID: Readonly<Record<BubbleColor, BubbleShooterAssetIds>> = {
  [BubbleColor.Red]: BubbleShooterAssetIds.BubbleRed,
  [BubbleColor.Blue]: BubbleShooterAssetIds.BubbleBlue,
  [BubbleColor.Green]: BubbleShooterAssetIds.BubbleGreen,
  [BubbleColor.Yellow]: BubbleShooterAssetIds.BubbleYellow,
  [BubbleColor.Purple]: BubbleShooterAssetIds.BubblePurple,
  [BubbleColor.Stone]: BubbleShooterAssetIds.BubbleStone,
  // Power-up grid cells reuse the same world textures the in-flight
  // bomb / fireball projectiles already use.
  [BubbleColor.Bomb]: BubbleShooterAssetIds.BombBubble,
  [BubbleColor.Fireball]: BubbleShooterAssetIds.FireballBubble,
};
