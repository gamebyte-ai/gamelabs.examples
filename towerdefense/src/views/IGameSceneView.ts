import type { IView } from "@gamebyte/gamelabsjs";
import type { IEnemyState } from "../utilities/EnemyManager.js";
import type { IProjectileState, ITowerState } from "../utilities/CombatManager.js";

/**
 * Read API for the world-scene host view.
 *
 * The view owns all THREE rendering: it reconciles enemy, projectile,
 * and laser-beam meshes against the state snapshots passed from the
 * managers, and listens for ephemeral combat events (`onAreaImpact`,
 * `onTeslaArcFired`) to spawn shockwaves + tesla lightning visuals.
 */
export interface IGameSceneView extends IView {
  showBaseHpBar(): void;
  setBaseHpRatio(ratio: number): void;
  hideBaseHpBar(): void;

  /** Show a floating "+Xg" gold indicator at the given world-plane position. */
  showGoldPopup(worldX: number, worldZ: number, amount: number): void;

  /** Advance view-owned animations (gold popups, trails, rings, arcs). */
  tickAnimations(dt: number): void;

  /**
   * Reconcile enemy meshes against the manager's current state. Creates
   * meshes for new ids, disposes meshes for gone ids, updates position /
   * rotation / HP bar / freeze overlay for the rest.
   */
  reconcileEnemies(enemies: ReadonlyArray<IEnemyState>): void;

  /**
   * Reconcile projectile meshes (linear + arc) against the manager's
   * current state. Handles mesh creation, position updates, and
   * disposal of projectiles that have resolved.
   */
  reconcileProjectiles(projectiles: ReadonlyArray<IProjectileState>): void;

  /**
   * Reconcile persistent laser beam lines: one line per beam tower
   * with a non-zero `lockedTargetId`. The view looks up the locked
   * enemy in `enemies` to place the beam's end point.
   */
  reconcileLaserBeams(
    towers: ReadonlyArray<ITowerState>,
    enemies: ReadonlyArray<IEnemyState>,
  ): void;

  /** Spawn an ephemeral shockwave ring at a ground-plane point (area-impact visual). */
  spawnShockwave(x: number, z: number, radius: number): void;

  /** Spawn an ephemeral jagged lightning arc between two world-space points (Tesla visual). */
  spawnTeslaArc(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void;
}
