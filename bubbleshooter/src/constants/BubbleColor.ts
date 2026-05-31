export enum BubbleColor {
  Red = 0,
  Blue = 1,
  Green = 2,
  Yellow = 3,
  Purple = 4,
  /**
   * Special "stone" cell — immune to colour matches. Stones still
   * fall when disconnected and pop on the fall threshold (without
   * awarding points).
   */
  Stone = 5,
  /**
   * Power-up cells embedded in the grid. Not match-eligible, not
   * directly popped by bomb / fireball blasts. Collected when an
   * adjacent bubble pops OR when the cell itself becomes
   * disconnected — collection flies the icon to the matching HUD
   * button and bumps that power-up's inventory by 1.
   */
  Bomb = 6,
  Fireball = 7,
}

export const BUBBLE_COLOR_HEX: Readonly<Record<BubbleColor, number>> = {
  [BubbleColor.Red]: 0xe74c3c,
  [BubbleColor.Blue]: 0x3aa6f0,
  [BubbleColor.Green]: 0x2ecc71,
  [BubbleColor.Yellow]: 0xf1c40f,
  [BubbleColor.Purple]: 0xa569d4,
  [BubbleColor.Stone]: 0x8c8a82,
  // Fallback hexes if a texture asset is missing — bomb stays slate
  // (matches the bomb sprite's body), fireball goes warm orange.
  [BubbleColor.Bomb]: 0x26262a,
  [BubbleColor.Fireball]: 0xff6420,
};

/**
 * Playable colour palette — colours the shooter can hold and the
 * match finder treats as part of a connected group. Excludes Stone
 * and the power-up cell types.
 */
export const BUBBLE_COLORS: readonly BubbleColor[] = [
  BubbleColor.Red,
  BubbleColor.Blue,
  BubbleColor.Green,
  BubbleColor.Yellow,
  BubbleColor.Purple,
];

/** Every cell type the view needs a texture / material for. */
export const ALL_BUBBLE_COLORS: readonly BubbleColor[] = [
  ...BUBBLE_COLORS,
  BubbleColor.Stone,
  BubbleColor.Bomb,
  BubbleColor.Fireball,
];

/**
 * True when the cell is a power-up bubble (bomb or fireball).
 * Collected on adjacency-pop or disconnect-fall instead of being
 * popped, so it's immune to match groups, bomb blast, fireball pass.
 */
export function isPowerUpColor(
  color: BubbleColor | null,
): color is BubbleColor.Bomb | BubbleColor.Fireball {
  return color === BubbleColor.Bomb || color === BubbleColor.Fireball;
}
