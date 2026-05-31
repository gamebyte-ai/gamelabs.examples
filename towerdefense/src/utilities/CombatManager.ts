import { TowerTypeId, TOWER_TYPES, type TowerTypeDef } from "../constants/TowerTypeDef.js";
import type { IEnemyState, IProjectileState, ITowerState } from "../constants/EntityStates.js";
import type { TowerDefenseConfig } from "../TowerDefenseConfig.js";
import type { GameEvents } from "../events/GameEvents.js";
import type { SfxService } from "../services/SfxService.js";
import type { EnemyManager } from "./EnemyManager.js";

export type { IProjectileState, ITowerState } from "../constants/EntityStates.js";

interface TowerInstance {
  col: number;
  row: number;
  towerTypeId: TowerTypeId;
  cooldown: number;
  lockedTargetId: number;
  consecutiveHits: number;
}

interface ProjectileBase {
  id: number;
  color: number;
  damage: number;
  isArea: boolean;
  areaRadius: number;
  knockbackForce: number;
  towerCol: number;
  towerRow: number;
  freezeDuration: number;
  posX: number;
  posY: number;
  posZ: number;
}

interface LinearProjectileInstance extends ProjectileBase {
  kind: "linear";
  targetId: number;
  speed: number;
}

interface ArcProjectileInstance extends ProjectileBase {
  kind: "arc";
  startX: number;
  startY: number;
  startZ: number;
  impactX: number;
  impactZ: number;
  duration: number;
  elapsed: number;
  peakHeight: number;
}

type ProjectileInstance = LinearProjectileInstance | ArcProjectileInstance;

/**
 * Combat state manager: tower attack cadence, projectile physics, and
 * laser-beam lock-on.
 *
 * Pure state — no THREE imports, no mesh creation. `GameSceneView`
 * reconciles projectile / beam meshes against
 * {@link activeProjectiles} / {@link activeTowers} each frame, and
 * subscribes to `onAreaImpact` / `onTeslaArcFired` for ephemeral
 * effects. The manager emits `onCannonFired` whenever a tower acquires
 * or re-aims at a target so the grid view can rotate the turret.
 */
export class CombatManager {
  private static readonly TOWER_LAUNCH_Y = 0.5;
  private static readonly LINEAR_HIT_DISTANCE = 0.18;

  private readonly _config: TowerDefenseConfig;
  private readonly _events: GameEvents;
  private readonly _sfx: SfxService;
  private readonly _enemyManager: EnemyManager;
  private readonly _towers: TowerInstance[] = [];
  private readonly _projectiles: ProjectileInstance[] = [];
  private _nextProjectileId = 1;

  public constructor(
    config: TowerDefenseConfig,
    events: GameEvents,
    sfx: SfxService,
    enemyManager: EnemyManager,
  ) {
    this._config = config;
    this._events = events;
    this._sfx = sfx;
    this._enemyManager = enemyManager;
  }

  public get activeTowers(): ReadonlyArray<ITowerState> {
    return this._towers;
  }

  public get activeProjectiles(): ReadonlyArray<IProjectileState> {
    return this._projectiles;
  }

  public addTower(col: number, row: number, towerTypeId: TowerTypeId): void {
    const typeDef = TOWER_TYPES.get(towerTypeId);
    if (!typeDef) return;
    this._towers.push({
      col, row, towerTypeId,
      cooldown: typeDef.attackInterval,
      lockedTargetId: 0,
      consecutiveHits: 0,
    });
  }

  public clearTowers(): void {
    this._towers.length = 0;
    this._projectiles.length = 0;
  }

  public update(dt: number): void {
    this._tickTowers(dt);
    this._tickProjectiles(dt);
  }

  public destroy(): void {
    this.clearTowers();
  }

  // ── Tower attack ──────────────────────────────────────────────────────

  private _tickTowers(dt: number): void {
    const enemies = this._enemyManager.activeEnemies;
    for (const tower of this._towers) {
      const typeDef = TOWER_TYPES.get(tower.towerTypeId);
      if (!typeDef) continue;

      if (typeDef.isBeamTower) {
        this._tickLaserBeam(tower, typeDef, enemies, dt);
        continue;
      }

      tower.cooldown -= dt;
      if (tower.cooldown > 0 || enemies.length === 0) continue;

      if (typeDef.isInstantHit) {
        if (this._fireTesla(tower, typeDef, enemies)) tower.cooldown = typeDef.attackInterval;
        continue;
      }

      const target = this._findTarget(tower.col, tower.row, typeDef.range, enemies);
      if (!target) continue;
      tower.cooldown = typeDef.attackInterval;
      this._fireProjectile(tower, target, typeDef);
    }
  }

  private _findTarget(
    col: number, row: number, range: number, enemies: ReadonlyArray<IEnemyState>,
  ): IEnemyState | null {
    const r2 = range * range;
    let closest: IEnemyState | null = null;
    let bestDist = r2;
    let lowHpTarget: IEnemyState | null = null;
    let lowestHp = Infinity;
    for (const e of enemies) {
      const dx = e.posX - col;
      const dz = e.posZ - row;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      if (d2 < bestDist) { bestDist = d2; closest = e; }
      const hpRatio = e.hp / e.typeDef.hp;
      if (hpRatio < 0.25 && e.hp < lowestHp) { lowestHp = e.hp; lowHpTarget = e; }
    }
    return lowHpTarget ?? closest;
  }

  /** Find up to N enemies in range, sorted by distance. */
  private _findTargets(
    col: number, row: number, range: number, max: number, enemies: ReadonlyArray<IEnemyState>,
  ): IEnemyState[] {
    const r2 = range * range;
    const hits: { e: IEnemyState; d2: number }[] = [];
    for (const e of enemies) {
      const dx = e.posX - col;
      const dz = e.posZ - row;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) hits.push({ e, d2 });
    }
    hits.sort((a, b) => a.d2 - b.d2);
    return hits.slice(0, max).map((h) => h.e);
  }

  // ── Projectile fire ───────────────────────────────────────────────────

  private _fireProjectile(tower: TowerInstance, target: IEnemyState, typeDef: TowerTypeDef): void {
    if (typeDef.projectileArc) {
      this._fireArc(tower, target, typeDef);
      this._sfx.playCannonLaunch();
      this._events.emitCannonFired(tower.col, tower.row, target.posX, target.posZ);
    } else {
      this._sfx.playArcherFire();
      this._fireLinear(tower, target, typeDef);
    }
  }

  private _fireLinear(tower: TowerInstance, target: IEnemyState, typeDef: TowerTypeDef): void {
    const sX = tower.col;
    const sY = CombatManager.TOWER_LAUNCH_Y;
    const sZ = tower.row;
    this._projectiles.push({
      id: this._nextProjectileId++,
      kind: "linear",
      color: typeDef.color,
      damage: typeDef.damage,
      isArea: typeDef.isAreaDamage,
      areaRadius: typeDef.areaRadius,
      knockbackForce: typeDef.knockbackForce,
      towerCol: tower.col,
      towerRow: tower.row,
      freezeDuration: typeDef.freezeDuration,
      posX: sX, posY: sY, posZ: sZ,
      targetId: target.id,
      speed: typeDef.projectileSpeed,
    });
  }

  private _fireArc(tower: TowerInstance, target: IEnemyState, typeDef: TowerTypeDef): void {
    const sX = tower.col;
    const sY = CombatManager.TOWER_LAUNCH_Y;
    const sZ = tower.row;
    const dx = target.posX - sX;
    const dz = target.posZ - sZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this._projectiles.push({
      id: this._nextProjectileId++,
      kind: "arc",
      color: typeDef.color,
      damage: typeDef.damage,
      isArea: typeDef.isAreaDamage,
      areaRadius: typeDef.areaRadius,
      knockbackForce: typeDef.knockbackForce,
      towerCol: tower.col,
      towerRow: tower.row,
      freezeDuration: typeDef.freezeDuration,
      posX: sX, posY: sY, posZ: sZ,
      startX: sX, startY: sY, startZ: sZ,
      impactX: target.posX, impactZ: target.posZ,
      duration: Math.max(0.3, dist / typeDef.projectileSpeed),
      elapsed: 0,
      peakHeight: dist * this._config.cannonArcHeightFactor,
    });
  }

  // ── Tesla instant-hit ─────────────────────────────────────────────────

  private _fireTesla(
    tower: TowerInstance, typeDef: TowerTypeDef, enemies: ReadonlyArray<IEnemyState>,
  ): boolean {
    const targets = this._findTargets(tower.col, tower.row, typeDef.range, typeDef.maxTargets, enemies);
    if (targets.length === 0) return false;

    this._sfx.playTeslaZap();

    for (const t of targets) {
      this._enemyManager.damageEnemy(t.id, typeDef.damage);
      const kbx = t.posX - tower.col;
      const kbz = t.posZ - tower.row;
      const kbLen = Math.sqrt(kbx * kbx + kbz * kbz);
      if (kbLen > 0.01) {
        this._enemyManager.applyKnockback(
          t.id,
          (kbx / kbLen) * typeDef.knockbackForce,
          (kbz / kbLen) * typeDef.knockbackForce,
        );
      }
      this._events.emitTeslaArcFired(
        tower.col, CombatManager.TOWER_LAUNCH_Y, tower.row,
        t.posX, 0.32 * t.typeDef.scale, t.posZ,
      );
    }
    return true;
  }

  // ── Laser beam (persistent) ────────────────────────────────────────────

  /**
   * Called every frame for beam towers. Maintains lock-on and applies
   * damage on cooldown ticks. The persistent beam visual is reconciled
   * by the view from `lockedTargetId` — see `GameSceneView`.
   */
  private _tickLaserBeam(
    tower: TowerInstance, typeDef: TowerTypeDef, enemies: ReadonlyArray<IEnemyState>, dt: number,
  ): void {
    const r2 = typeDef.range * typeDef.range;

    let locked: IEnemyState | undefined;
    if (tower.lockedTargetId > 0) {
      locked = enemies.find((e) => e.id === tower.lockedTargetId);
      if (locked) {
        const dx = locked.posX - tower.col;
        const dz = locked.posZ - tower.row;
        if (dx * dx + dz * dz > r2) locked = undefined;
      }
    }

    if (!locked) {
      tower.consecutiveHits = 0;
      if (enemies.length === 0) { tower.lockedTargetId = 0; return; }
      const newTarget = this._findTarget(tower.col, tower.row, typeDef.range, enemies);
      if (!newTarget) { tower.lockedTargetId = 0; return; }
      tower.lockedTargetId = newTarget.id;
      locked = newTarget;
    }

    // Rotate turret toward target every frame.
    this._events.emitCannonFired(tower.col, tower.row, locked.posX, locked.posZ);

    tower.cooldown -= dt;
    if (tower.cooldown > 0) return;
    tower.cooldown = typeDef.attackInterval;

    const dmg = typeDef.damage * Math.pow(typeDef.damageRampFactor, tower.consecutiveHits);
    this._enemyManager.damageEnemy(locked.id, dmg);
    tower.consecutiveHits++;

    const kbx = locked.posX - tower.col;
    const kbz = locked.posZ - tower.row;
    const kbLen = Math.sqrt(kbx * kbx + kbz * kbz);
    if (kbLen > 0.01) {
      this._enemyManager.applyKnockback(
        locked.id,
        (kbx / kbLen) * typeDef.knockbackForce,
        (kbz / kbLen) * typeDef.knockbackForce,
      );
    }

    this._sfx.playLaserHit();
  }

  // ── Projectile tick ───────────────────────────────────────────────────

  private _tickProjectiles(dt: number): void {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      if (p.kind === "arc") {
        this._tickArc(p, i, dt);
      } else {
        this._tickLinear(p, i, dt);
      }
    }
  }

  private _tickLinear(p: LinearProjectileInstance, index: number, dt: number): void {
    const enemies = this._enemyManager.activeEnemies;
    const target = enemies.find((e) => e.id === p.targetId);
    if (!target) { this._projectiles.splice(index, 1); return; }
    const dx = target.posX - p.posX;
    const dy = (0.32 * target.typeDef.scale - p.posY);
    const dz = target.posZ - p.posZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < CombatManager.LINEAR_HIT_DISTANCE) {
      this._sfx.playArcherHit();
      this._enemyManager.damageEnemy(p.targetId, p.damage);
      const kbx = target.posX - p.towerCol;
      const kbz = target.posZ - p.towerRow;
      const kbLen = Math.sqrt(kbx * kbx + kbz * kbz);
      if (kbLen > 0.01) {
        this._enemyManager.applyKnockback(
          p.targetId,
          (kbx / kbLen) * p.knockbackForce,
          (kbz / kbLen) * p.knockbackForce,
        );
      }
      this._projectiles.splice(index, 1);
      return;
    }
    const step = (p.speed * dt) / dist;
    p.posX += dx * step;
    p.posY += dy * step;
    p.posZ += dz * step;
  }

  private _tickArc(p: ArcProjectileInstance, index: number, dt: number): void {
    p.elapsed += dt;
    const t = Math.min(1, p.elapsed / p.duration);
    const x = p.startX + (p.impactX - p.startX) * t;
    const z = p.startZ + (p.impactZ - p.startZ) * t;
    const baseY = p.startY + (0 - p.startY) * t;
    p.posX = x;
    p.posY = baseY + 4 * p.peakHeight * t * (1 - t);
    p.posZ = z;
    if (t >= 1) {
      if (p.isArea) {
        this._enemyManager.damageEnemiesInArea(p.impactX, p.impactZ, p.areaRadius, p.damage);
        this._enemyManager.applyRadialKnockback(p.impactX, p.impactZ, p.areaRadius, p.knockbackForce);
        this._events.emitAreaImpact(p.impactX, p.impactZ, p.areaRadius);
        if (p.freezeDuration > 0) {
          this._sfx.playIceFreeze();
          this._enemyManager.freezeEnemiesInArea(p.impactX, p.impactZ, p.areaRadius, p.freezeDuration);
        } else {
          this._sfx.playCannonLand();
        }
      }
      this._projectiles.splice(index, 1);
    }
  }
}
