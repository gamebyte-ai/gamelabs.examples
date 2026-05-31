import type { IView } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";
import type { IAimTrajectory } from "../models/IAimTrajectory";

/**
 * Aim feedback layer — the marching dotted aim line and the ghost
 * landing-preview ring. Trajectory comes from ops; power-up tint
 * (red vs white) and landing colour are pushed in from the controller.
 */
export interface IAimLineView extends IView {
  setAimTrajectory(trajectory: IAimTrajectory): void;
  setAimPowerUpMode(active: boolean): void;
  setLandingPreviewColor(color: BubbleColor): void;
  updateAimDots(dt: number): void;
  /**
   * Toggle the aim-aid layer (dots + landing preview) on/off.
   * Default is `false` — the layer renders only when the player
   * opens it via the bottom-left target button. Internal trajectory
   * state still updates while hidden so toggling on instantly
   * shows the latest aim.
   */
  setAimAidVisible(visible: boolean): void;
}
