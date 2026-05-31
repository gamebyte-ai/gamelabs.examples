import type { EnemyTypeDef } from "./EnemyTypeDef.js";
import type { TowerTypeId } from "./TowerTypeDef.js";

/**
 * Readonly snapshot of a single enemy's state. The scene view reconciles
 * meshes against an array of these each frame.
 */
export interface IEnemyState {
  readonly id: number;
  readonly typeDef: EnemyTypeDef;
  readonly posX: number;
  readonly posZ: number;
  readonly velX: number;
  readonly velZ: number;
  readonly hp: number;
  /** 0 while not frozen; counts down to 0 while frozen. */
  readonly freezeTimer: number;
}

/**
 * Readonly snapshot of a placed tower. Exposed to views for laser-beam
 * rendering (locked tower → target) and per-tower visual state.
 */
export interface ITowerState {
  readonly col: number;
  readonly row: number;
  readonly towerTypeId: TowerTypeId;
  /** Laser only — id of the currently locked target, or 0 when none. */
  readonly lockedTargetId: number;
}

/** Readonly projectile state exposed for per-frame mesh reconciliation. */
export interface IProjectileState {
  readonly id: number;
  readonly kind: "linear" | "arc";
  /** Base color hex (controls projectile mesh + trail tint). */
  readonly color: number;
  readonly posX: number;
  readonly posY: number;
  readonly posZ: number;
}
