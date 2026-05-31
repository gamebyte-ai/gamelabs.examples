/**
 * Discriminator for the two power-up types — used in collection
 * events, count-bump tracks, and HUD button routing. Constant-valued
 * type, so it lives in `constants/` per the project's "Constants"
 * rule.
 */
export type PowerUpKind = "bomb" | "fireball";
