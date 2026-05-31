/**
 * Enemy type identifiers. Ordered by threat tier so new types
 * (e.g. Boss) can be appended without reordering.
 */
export enum EnemyTypeId {
  Scout = 1,
  Brute = 2,
}

export interface EnemyTypeDef {
  readonly id: EnemyTypeId;
  readonly name: string;
  /** Desired movement speed in cells per second. */
  readonly speed: number;
  readonly color: number;
  /** Uniform scale applied to the base sphere radius. */
  readonly scale: number;
  readonly hp: number;
  /** Damage dealt to the base when this enemy reaches it. */
  readonly baseDamage: number;
  /** Radius used for enemy–enemy separation physics. */
  readonly collisionRadius: number;
  /** 0 = full knockback, 1 = immune. */
  readonly knockbackResistance: number;
  /** Gold rewarded to the player when this enemy is killed. */
  readonly goldReward: number;
}

export const ENEMY_TYPES: ReadonlyMap<EnemyTypeId, EnemyTypeDef> = new Map([
  [EnemyTypeId.Scout, {
    id: EnemyTypeId.Scout,
    name: "Scout",
    speed: 0.75,
    color: 0xdd55ee,
    scale: 0.6,
    hp: 100,
    baseDamage: 50,
    collisionRadius: 0.1,
    knockbackResistance: 0.0,
    goldReward: 20,
  }],
  [EnemyTypeId.Brute, {
    id: EnemyTypeId.Brute,
    name: "Brute",
    speed: 0.45,
    color: 0x44aa88,
    scale: 1.2,
    hp: 350,
    baseDamage: 100,
    collisionRadius: 0.2,
    knockbackResistance: 0.6,
    goldReward: 40,
  }],
]);
