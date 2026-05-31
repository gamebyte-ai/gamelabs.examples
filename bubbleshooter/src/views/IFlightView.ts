import type { IView } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";

/**
 * In-flight projectile layer — owns the three visuals that exist
 * between fire and snap: a coloured bubble, a bomb, and a fireball.
 * At most one is visible at a time; all three are single, reused
 * meshes toggled by visibility.
 */
export interface IFlightView extends IView {
  /** Coloured bubble in flight. `color === null` hides the mesh. */
  setFlyingBubble(color: BubbleColor | null, x: number, y: number): void;
  /** Bomb power-up in flight. `active === false` hides the mesh. */
  setFlyingBomb(active: boolean, x: number, y: number): void;
  /** Fireball in flight (straight-line projectile). `active === false` hides. */
  setFireball(active: boolean, x: number, y: number): void;
}
