import type { IParticleEmitter, IView } from "@gamebyte/gamelabsjs";

export interface IGameAreaView extends IView {
  setPlayerPosition(x: number, y: number): void;
  addEnemy(id: number, x: number, y: number): void;
  setEnemyPosition(id: number, x: number, y: number): void;
  removeEnemy(id: number): void;
  removeAllEnemies(): void;

  /** Drive the propulsion trail from the player's per-frame velocity (world units / sec). */
  setPropulsionState(vx: number, vy: number): void;
  /** Fire a one-shot explosion at the given world position. */
  spawnExplosion(x: number, y: number): void;

  /** Exposed via `IParticleEmitter` so the controller can register / unregister without manipulating renderer types. */
  readonly propulsionEmitter: IParticleEmitter;
  readonly explosionEmitter: IParticleEmitter;
}
