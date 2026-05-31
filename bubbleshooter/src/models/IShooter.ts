import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";

export interface IShooter {
  readonly heldColor: BubbleColor | null;
  readonly nextColor: BubbleColor | null;
  readonly aimAngle: number;
  /** True when the held slot is loaded with a bomb power-up instead of a colour bubble. */
  readonly isBomb: boolean;
  /** True when the held slot is loaded with a fireball power-up. Mutually exclusive with `isBomb`. */
  readonly isFireball: boolean;
}

export const IShooter = new InjectionToken<IShooter>("IShooter");
