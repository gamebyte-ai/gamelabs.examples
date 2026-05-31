import type { IParticleEmitter, IView } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";

/**
 * Transient pop feedback — particle bursts (delegated to a
 * `WorldParticleEmitter` ticked by `ParticleManager`) and floating score
 * popups (canvas-textured planes ticked here per frame). The view owns
 * the emitter's mesh + materials; the controller resolves
 * `ParticleManager` and `register`s the exposed emitter.
 */
export interface IEffectsView extends IView {
  /**
   * Pop-burst emitter exposed for the controller's `ParticleManager.register`
   * call. Throws if accessed before `postInitialize` has built it.
   */
  readonly popBurstEmitter: IParticleEmitter;
  playPopBurst(x: number, y: number, color: BubbleColor): void;
  playScorePopup(x: number, y: number, color: BubbleColor, points: number): void;
  updateScorePopups(dt: number): void;
}
