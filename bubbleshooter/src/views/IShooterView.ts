import type { IView } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";

/**
 * The shooter rig at the bottom of the play area: turret ring +
 * barrel, held bubble, next-bubble preview slot, and the held-slot
 * power-ups (bomb, fireball). Owns the swap animation that runs
 * when the player flips the held / next bubbles.
 */
export interface IShooterView extends IView {
  setShooterHeldColor(color: BubbleColor | null): void;
  setShooterNextColor(color: BubbleColor | null): void;
  setShooterIsBomb(active: boolean): void;
  setShooterIsFireball(active: boolean): void;
  setShooterAimAngle(angle: number): void;
  playShooterSwap(newHeld: BubbleColor, newNext: BubbleColor): void;
  updateShooterAnim(dt: number): void;
}
