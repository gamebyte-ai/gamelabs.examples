import type { TowerDefenseConfig } from "../TowerDefenseConfig.js";
import type { GameEvents } from "../events/GameEvents.js";
import type { ILevelState } from "./ILevelState.js";
import { EnemyTypeId, ENEMY_TYPES, type EnemyTypeDef } from "../constants/EnemyTypeDef.js";
import type { IEnemyState } from "../constants/EntityStates.js";
import { CellType } from "../constants/CellType.js";

export type { IEnemyState } from "../constants/EntityStates.js";

interface EnemyInstance {
  id: number;
  typeDef: EnemyTypeDef;
  hp: number;
  lateralOffset: number;
  posX: number;
  posZ: number;
  velX: number;
  velZ: number;
  waypointIndex: number;
  slowTimer: number;
  freezeTimer: number;
}

interface SpawnEntry {
  readonly typeId: EnemyTypeId;
  readonly delay: number;
}

/**
 * Physics-based enemy state manager.
 *
 * Owns:
 * - Group-based spawn scheduling (timers + queue)
 * - Per-frame physics: steering, separation, cell avoidance, damping
 * - Waypoint tracking for path following
 * - Damage / kill / reached-base lifecycle
 * - Knockback + freeze + slow timers
 *
 * Emits via `GameEvents`:
 * - `onEnemyKilled(reward, worldX, worldZ)` when hp ≤ 0 from damage
 * - `onEnemyReachedBase(damage)` when an enemy reaches the last path cell
 *
 * **No renderer dependency.** The `GameSceneView` reconciles THREE
 * meshes against {@link activeEnemies} each frame. State managers
 * coordinate state, not rendering — this class is unit-testable with
 * no THREE present.
 */
export class EnemyManager {
  private readonly _config: TowerDefenseConfig;
  private readonly _events: GameEvents;
  private readonly _level: ILevelState;
  private readonly _enemies: EnemyInstance[] = [];

  private _groupCount = 0;
  private _groupTimer = 0;
  private _spawnQueue: SpawnEntry[] = [];
  private _memberTimer = 0;
  private _spawning = true;
  private _nextId = 1;

  public constructor(config: TowerDefenseConfig, events: GameEvents, level: ILevelState) {
    this._config = config;
    this._events = events;
    this._level = level;
  }

  public get activeEnemies(): ReadonlyArray<IEnemyState> {
    return this._enemies;
  }

  public update(dt: number): void {
    this._tickSpawning(dt);
    this._tickPhysics(dt);
  }

  // ── Spawning ──────────────────────────────────────────────────────────

  public setSpawning(active: boolean): void {
    this._spawning = active;
    if (active) { this._groupTimer = 0; this._groupCount = 0; this._spawnQueue = []; this._memberTimer = 0; }
  }

  private _tickSpawning(dt: number): void {
    if (!this._spawning) return;
    const path = this._level.pathWaypoints;
    if (path.length < 2) return;
    if (this._spawnQueue.length > 0) {
      this._memberTimer += dt;
      while (this._spawnQueue.length > 0 && this._memberTimer >= this._spawnQueue[0]!.delay) {
        const entry = this._spawnQueue.shift()!;
        this._memberTimer -= entry.delay;
        this._spawn(entry.typeId);
      }
      return;
    }
    this._groupTimer += dt;
    if (this._groupTimer >= this._config.spawnGroupInterval) {
      this._groupTimer -= this._config.spawnGroupInterval;
      this._enqueueGroup();
    }
  }

  private _enqueueGroup(): void {
    const cfg = this._config;
    const size = cfg.spawnGroupMin + Math.floor(Math.random() * (cfg.spawnGroupMax - cfg.spawnGroupMin + 1));
    const bruteAllowed = this._groupCount >= cfg.bruteUnlockGroup;
    let accDelay = 0;
    for (let i = 0; i < size; i++) {
      const isBrute = bruteAllowed && Math.random() < cfg.bruteChance;
      this._spawnQueue.push({ typeId: isBrute ? EnemyTypeId.Brute : EnemyTypeId.Scout, delay: accDelay });
      accDelay = cfg.spawnMemberDelayMin + Math.random() * (cfg.spawnMemberDelayMax - cfg.spawnMemberDelayMin);
    }
    this._groupCount++;
  }

  private _spawn(typeId: EnemyTypeId): void {
    const typeDef = ENEMY_TYPES.get(typeId);
    if (!typeDef) return;
    const [startCol, startRow] = this._level.pathWaypoints[0];
    this._enemies.push({
      id: this._nextId++, typeDef,
      hp: typeDef.hp,
      lateralOffset: (Math.random() * 2 - 1) * this._config.enemyLateralOffsetMax,
      posX: startCol, posZ: startRow, velX: 0, velZ: 0,
      waypointIndex: 1, slowTimer: 0, freezeTimer: 0,
    });
  }

  // ── Physics tick ──────────────────────────────────────────────────────

  private _tickPhysics(dt: number): void {
    const path = this._level.pathWaypoints;
    if (path.length < 2) return;
    const cfg = this._config;

    for (let i = this._enemies.length - 1; i >= 0; i--) {
      const e = this._enemies[i];

      // Tick freeze timer — frozen enemies skip all movement
      if (e.freezeTimer > 0) {
        e.freezeTimer = Math.max(0, e.freezeTimer - dt);
        e.velX = 0;
        e.velZ = 0;
        continue;
      }

      // Tick slow timer
      if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);

      // 1. Steering (reduced when slowed)
      const [tx, tz] = this._getWaypointTarget(e, path);
      const sdx = tx - e.posX;
      const sdz = tz - e.posZ;
      const sDist = Math.sqrt(sdx * sdx + sdz * sdz);
      let steerX = 0;
      let steerZ = 0;
      if (sDist > 0.01) {
        const speedMult = e.slowTimer > 0 ? cfg.knockbackSlowFactor : 1;
        const str = cfg.enemySteeringForce * e.typeDef.speed * speedMult;
        steerX = (sdx / sDist) * str;
        steerZ = (sdz / sDist) * str;
      }

      // 2. Separation
      let sepX = 0;
      let sepZ = 0;
      for (let j = 0; j < this._enemies.length; j++) {
        if (j === i) continue;
        const o = this._enemies[j];
        const dx = e.posX - o.posX;
        const dz = e.posZ - o.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = e.typeDef.collisionRadius + o.typeDef.collisionRadius + cfg.enemySeparationRadius;
        if (dist < minDist && dist > 0.001) {
          const overlap = (minDist - dist) / minDist;
          sepX += (dx / dist) * overlap * cfg.enemySeparationForce;
          sepZ += (dz / dist) * overlap * cfg.enemySeparationForce;
        }
      }

      // 3. Cell avoidance
      let cellX = 0;
      let cellZ = 0;
      const gc = Math.round(e.posX);
      const gr = Math.round(e.posZ);
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const c = gc + dc;
          const r = gr + dr;
          const solid = c < 0 || c >= cfg.cols || r < 0 || r >= cfg.rows || this._isSolidCell(c, r);
          if (!solid) continue;
          const bx = e.posX - c;
          const bz = e.posZ - r;
          const bDist = Math.sqrt(bx * bx + bz * bz);
          if (bDist < 0.8 && bDist > 0.001) {
            const push = ((0.8 - bDist) / 0.8) * cfg.enemyCellRepulsionForce;
            cellX += (bx / bDist) * push;
            cellZ += (bz / bDist) * push;
          }
        }
      }

      // 4. Integrate
      e.velX += (steerX + sepX + cellX) * dt;
      e.velZ += (steerZ + sepZ + cellZ) * dt;
      const damp = Math.exp(-cfg.enemyDamping * dt);
      e.velX *= damp;
      e.velZ *= damp;
      const maxSpd = e.typeDef.speed * 1.5;
      const spd = Math.sqrt(e.velX * e.velX + e.velZ * e.velZ);
      if (spd > maxSpd) { e.velX *= maxSpd / spd; e.velZ *= maxSpd / spd; }

      // 5. Position
      e.posX += e.velX * dt;
      e.posZ += e.velZ * dt;

      // 6. Waypoint
      if (e.waypointIndex < path.length) {
        const wp = path[e.waypointIndex];
        const wdx = wp[0] - e.posX;
        const wdz = wp[1] - e.posZ;
        if (wdx * wdx + wdz * wdz < cfg.enemyWaypointRadius * cfg.enemyWaypointRadius) e.waypointIndex++;
      }
      if (e.waypointIndex >= path.length) this._onReachedBase(i);
    }
  }

  private _isSolidCell(col: number, row: number): boolean {
    const ct = this._level.getCellType(col, row);
    return ct !== CellType.Path && ct !== CellType.Spawn && ct !== CellType.Base;
  }

  private _getWaypointTarget(e: EnemyInstance, path: ReadonlyArray<readonly [number, number]>): [number, number] {
    const wi = Math.min(e.waypointIndex, path.length - 1);
    const wp = path[wi];
    let dx: number;
    let dz: number;
    if (wi > 0) { const p = path[wi - 1]; dx = wp[0] - p[0]; dz = wp[1] - p[1]; }
    else if (wi < path.length - 1) { const n = path[wi + 1]; dx = n[0] - wp[0]; dz = n[1] - wp[1]; }
    else { return [wp[0], wp[1]]; }
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return [wp[0], wp[1]];
    return [wp[0] + (-dz / len) * e.lateralOffset, wp[1] + (dx / len) * e.lateralOffset];
  }

  // ── Knockback API ─────────────────────────────────────────────────────

  public applyKnockback(enemyId: number, forceX: number, forceZ: number): void {
    const enemy = this._enemies.find((e) => e.id === enemyId);
    if (!enemy) return;
    const r = 1 - enemy.typeDef.knockbackResistance;
    enemy.velX += forceX * r;
    enemy.velZ += forceZ * r;
    enemy.slowTimer = this._config.knockbackSlowDuration;
  }

  public applyRadialKnockback(cx: number, cz: number, radius: number, force: number): void {
    const r2 = radius * radius;
    for (const e of this._enemies) {
      const dx = e.posX - cx;
      const dz = e.posZ - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r2 && d2 > 0.0001) {
        const dist = Math.sqrt(d2);
        const str = force * (1 - dist / radius) * (1 - e.typeDef.knockbackResistance);
        e.velX += (dx / dist) * str;
        e.velZ += (dz / dist) * str;
        e.slowTimer = this._config.knockbackSlowDuration;
      }
    }
  }

  // ── Freeze API ─────────────────────────────────────────────────────────

  /** Freeze all enemies within radius for `duration` seconds. */
  public freezeEnemiesInArea(cx: number, cz: number, radius: number, duration: number): void {
    const r2 = radius * radius;
    for (const e of this._enemies) {
      if ((e.posX - cx) ** 2 + (e.posZ - cz) ** 2 <= r2) {
        e.freezeTimer = duration;
        e.velX = 0;
        e.velZ = 0;
      }
    }
  }

  // ── Damage ────────────────────────────────────────────────────────────

  public damageEnemy(id: number, amount: number): boolean {
    const idx = this._enemies.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const enemy = this._enemies[idx];
    enemy.hp -= amount;
    if (enemy.hp <= 0) { this._killEnemy(idx); return true; }
    return false;
  }

  public damageEnemiesInArea(x: number, z: number, radius: number, amount: number): void {
    const r2 = radius * radius;
    for (let i = this._enemies.length - 1; i >= 0; i--) {
      const e = this._enemies[i];
      if ((e.posX - x) ** 2 + (e.posZ - z) ** 2 <= r2) {
        e.hp -= amount;
        if (e.hp <= 0) this._killEnemy(i);
      }
    }
  }

  /** Enemy killed by damage — emit reward event, then destroy. */
  private _killEnemy(index: number): void {
    const enemy = this._enemies[index];
    this._events.emitEnemyKilled(enemy.typeDef.goldReward, enemy.posX, enemy.posZ);
    this._enemies.splice(index, 1);
  }

  private _onReachedBase(index: number): void {
    const damage = this._enemies[index].typeDef.baseDamage;
    this._enemies.splice(index, 1);
    this._events.emitEnemyReachedBase(damage);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  public clearAll(): void {
    this._enemies.length = 0;
    this._spawnQueue = [];
    this._memberTimer = 0;
    this._groupTimer = 0;
    this._groupCount = 0;
  }

  public destroy(): void {
    this.clearAll();
  }
}
