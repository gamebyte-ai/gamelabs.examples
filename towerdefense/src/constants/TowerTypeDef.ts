export enum TowerTypeId {
  Archer = 1,
  Cannon = 2,
  Tesla = 3,
  Ice = 4,
  Laser = 5,
}

export interface TowerTypeDef {
  readonly id: TowerTypeId;
  readonly name: string;
  readonly color: number;
  readonly range: number;
  readonly attackInterval: number;
  readonly damage: number;
  readonly isAreaDamage: boolean;
  readonly areaRadius: number;
  readonly cost: number;
  readonly knockbackForce: number;
  readonly projectileArc: boolean;
  readonly projectileSpeed: number;
  readonly maxTargets: number;
  readonly isInstantHit: boolean;
  /** Seconds enemies are frozen on area impact (Ice). 0 = none. */
  readonly freezeDuration: number;
  /** true = continuous beam lock-on behaviour (Laser). */
  readonly isBeamTower: boolean;
  /** Damage multiplier per consecutive hit on same target (Laser). 1 = no ramp. */
  readonly damageRampFactor: number;
}

export const TOWER_TYPES: ReadonlyMap<TowerTypeId, TowerTypeDef> = new Map([
  [TowerTypeId.Archer, {
    id: TowerTypeId.Archer, name: "Archer", color: 0x33aa55,
    range: 2, attackInterval: 0.5, damage: 10, isAreaDamage: false, areaRadius: 0, cost: 150,
    knockbackForce: 1.2, projectileArc: false, projectileSpeed: 10,
    maxTargets: 1, isInstantHit: false, freezeDuration: 0, isBeamTower: false, damageRampFactor: 1,
  }],
  [TowerTypeId.Cannon, {
    id: TowerTypeId.Cannon, name: "Cannon", color: 0xaa3333,
    range: 4, attackInterval: 3, damage: 40, isAreaDamage: true, areaRadius: 1.2, cost: 350,
    knockbackForce: 4.0, projectileArc: true, projectileSpeed: 2.5,
    maxTargets: 1, isInstantHit: false, freezeDuration: 0, isBeamTower: false, damageRampFactor: 1,
  }],
  [TowerTypeId.Tesla, {
    id: TowerTypeId.Tesla, name: "Tesla", color: 0x4488ff,
    range: 1.5, attackInterval: 1.5, damage: 18, isAreaDamage: false, areaRadius: 0, cost: 450,
    knockbackForce: 0.8, projectileArc: false, projectileSpeed: 0,
    maxTargets: 4, isInstantHit: true, freezeDuration: 0, isBeamTower: false, damageRampFactor: 1,
  }],
  [TowerTypeId.Ice, {
    id: TowerTypeId.Ice, name: "Ice", color: 0x66ccee,
    range: 1.8, attackInterval: 4, damage: 5, isAreaDamage: true, areaRadius: 1.2, cost: 400,
    knockbackForce: 0.5, projectileArc: true, projectileSpeed: 3,
    maxTargets: 1, isInstantHit: false, freezeDuration: 2.0, isBeamTower: false, damageRampFactor: 1,
  }],
  [TowerTypeId.Laser, {
    id: TowerTypeId.Laser, name: "Laser", color: 0xaa44ff,
    range: 3, attackInterval: 1.0, damage: 2, isAreaDamage: false, areaRadius: 0, cost: 500,
    knockbackForce: 0.3, projectileArc: false, projectileSpeed: 0,
    maxTargets: 1, isInstantHit: true, freezeDuration: 0, isBeamTower: true, damageRampFactor: 2.0,
  }],
]);
