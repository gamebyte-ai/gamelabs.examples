import * as THREE from "three";
import {
  WorldParticleEmitter,
  type IParticleBehavior,
  type Particle,
  type ParticleBudget,
} from "@gamebyte/gamelabsjs";
import type { BlockPuzzleConfig } from "../../../BlockPuzzleConfig";

export type HammerParticle = {
  sprite: THREE.Mesh;
  /** Per-particle XZ velocity. `vz` accumulates `gravity` so the
   *  burst settles toward screen-down (world `+Z`) over its
   *  lifetime — matching the camera convention where world `+Z` is
   *  the bottom of the screen. */
  vx: number;
  vz: number;
};

/**
 * Per-burst initialiser. `burst()` sets `spawnX / spawnZ / color`
 * before `spawn(count)`, then `init` reads them for each new
 * particle. Random direction is uniform in the XZ plane; speed is
 * uniform in `[spawnSpeedMin, spawnSpeedMax)`.
 */
class HammerInitBehavior implements IParticleBehavior<HammerParticle> {
  public spawnX = 0;
  public spawnZ = 0;
  public color = 0xffffff;

  public constructor(private readonly _config: BlockPuzzleConfig) {}

  public init(p: Particle<HammerParticle>): void {
    const cfg = this._config.hammerParticles;
    const { sprite } = p.data;
    // Y sits slightly above the playing grid's cell-fill plane so
    // the particles render on top of cells (cells at 0.005) and
    // beneath any other HUD overlays.
    sprite.position.set(this.spawnX, 0.08, this.spawnZ);
    const angle = Math.random() * Math.PI * 2;
    const speed = cfg.spawnSpeedMin + Math.random() * (cfg.spawnSpeedMax - cfg.spawnSpeedMin);
    p.data.vx = Math.cos(angle) * speed;
    p.data.vz = Math.sin(angle) * speed;
    const mat = sprite.material as THREE.MeshBasicMaterial;
    mat.color.setHex(this.color);
    mat.opacity = 1;
  }

  public update(p: Particle<HammerParticle>, dt: number): void {
    const cfg = this._config.hammerParticles;
    const { sprite } = p.data;
    sprite.position.x += p.data.vx * dt;
    sprite.position.z += p.data.vz * dt;
    // Gravity accelerates toward `+Z` (screen-down), matching the
    // top-down camera convention used by `BoardLayoutCalculator`.
    p.data.vz += cfg.gravity * dt;
    (sprite.material as THREE.MeshBasicMaterial).opacity = 1 - p.progress;
  }
}

/**
 * One-shot burst emitter for the Hammer booster. Each call to
 * {@link burst} drops `count` coloured particles at the destroyed
 * cell's world position. Particles fan out in the XZ plane, gravity
 * pulls them screen-down, opacity fades over `lifetime`.
 *
 * The pool is sized to `count × 4` so successive bursts (the player
 * Hammering several cells in quick succession across consumes /
 * charges) don't drop frames evicting old particles.
 */
export class HammerParticleEmitter extends WorldParticleEmitter<HammerParticle> {
  private readonly _config: BlockPuzzleConfig;
  private readonly _geometry: THREE.PlaneGeometry;
  private readonly _initBehavior: HammerInitBehavior;

  public constructor(budget: ParticleBudget, config: BlockPuzzleConfig) {
    const cfg = config.hammerParticles;
    super(budget, {
      type: "BlockPuzzle.Hammer",
      rate: 0,
      maxParticles: cfg.count * 4,
      lifetime: { min: cfg.lifetime, max: cfg.lifetime },
      priority: 10,
    });
    this._config = config;
    this._geometry = new THREE.PlaneGeometry(cfg.size, cfg.size);
    this._initBehavior = new HammerInitBehavior(config);
    this.behaviors.push(this._initBehavior);
  }

  public burst(x: number, z: number, color: number): number {
    this._initBehavior.spawnX = x;
    this._initBehavior.spawnZ = z;
    this._initBehavior.color = color;
    return this.spawn(this._config.hammerParticles.count);
  }

  protected createParticleData(): HammerParticle {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Mesh(this._geometry, mat);
    sprite.rotation.x = -Math.PI / 2;
    sprite.visible = false;
    this.add(sprite);
    return { sprite, vx: 0, vz: 0 };
  }

  protected disposeParticleData(data: HammerParticle): void {
    (data.sprite.material as THREE.MeshBasicMaterial).dispose();
  }

  protected attachParticleData(data: HammerParticle): void {
    data.sprite.visible = true;
  }

  protected detachParticleData(data: HammerParticle): void {
    data.sprite.visible = false;
  }

  protected override onDestroy(): void {
    this._geometry.dispose();
  }
}
