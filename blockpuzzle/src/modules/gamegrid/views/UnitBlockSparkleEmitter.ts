import * as THREE from "three";
import {
  WorldParticleEmitter,
  type IParticleBehavior,
  type Particle,
  type ParticleBudget,
} from "@gamebyte/gamelabsjs";
import type { BlockPuzzleConfig } from "../../../BlockPuzzleConfig";

export type SparkleParticle = {
  sprite: THREE.Mesh;
  /** Per-particle XZ drift velocity, set on init based on the
   *  particle's emission angle so each star drifts radially out. */
  vx: number;
  vz: number;
};

/**
 * Per-particle initialiser. The view calls `setSpawnCenter(x, z)`
 * whenever the Unit Block temp piece is at a stable position; each
 * particle then spawns at a random radius around that centre and
 * drifts outward at `driftSpeed`. Opacity follows `sin(π · progress)`
 * — zero at spawn, peak at half-life, zero at end — so every sparkle
 * reads as a "pop in, glow, fade" beat.
 */
class SparkleInitBehavior implements IParticleBehavior<SparkleParticle> {
  public spawnX = 0;
  public spawnZ = 0;

  public constructor(private readonly _config: BlockPuzzleConfig) {}

  public init(p: Particle<SparkleParticle>): void {
    const cfg = this._config.unitBlockSparkles;
    const { sprite } = p.data;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * cfg.emitRadius;
    // Y sits slightly above the temp block's mesh so the sparkles
    // render on top of the piece, not buried beneath it.
    sprite.position.set(
      this.spawnX + Math.cos(angle) * radius,
      0.12,
      this.spawnZ + Math.sin(angle) * radius,
    );
    p.data.vx = Math.cos(angle) * cfg.driftSpeed;
    p.data.vz = Math.sin(angle) * cfg.driftSpeed;
    const mat = sprite.material as THREE.MeshBasicMaterial;
    mat.opacity = 0;
  }

  public update(p: Particle<SparkleParticle>, dt: number): void {
    const { sprite } = p.data;
    sprite.position.x += p.data.vx * dt;
    sprite.position.z += p.data.vz * dt;
    (sprite.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * p.progress);
  }
}

/**
 * Continuous sparkle emitter for the Unit Block booster's temp
 * 1-cell piece. The view positions the emission centre at the
 * piece's idle world location, then toggles `rate` to start / stop
 * emission on enter / drag-begin / mode-exit. All particles share a
 * single 5-pointed star `ShapeGeometry`; per-particle material owns
 * the alpha so the fade is independent per spawn.
 */
export class UnitBlockSparkleEmitter extends WorldParticleEmitter<SparkleParticle> {
  private readonly _config: BlockPuzzleConfig;
  private readonly _geometry: THREE.ShapeGeometry;
  private readonly _initBehavior: SparkleInitBehavior;

  public constructor(budget: ParticleBudget, config: BlockPuzzleConfig) {
    const cfg = config.unitBlockSparkles;
    super(budget, {
      type: "BlockPuzzle.UnitBlockSparkle",
      rate: 0,
      maxParticles: cfg.maxParticles,
      lifetime: { min: cfg.lifetimeSeconds, max: cfg.lifetimeSeconds },
      priority: 5,
    });
    this._config = config;
    this._geometry = new THREE.ShapeGeometry(
      UnitBlockSparkleEmitter._buildStarShape(cfg.starOuterRadius, cfg.starInnerRadius),
    );
    this._initBehavior = new SparkleInitBehavior(config);
    this.behaviors.push(this._initBehavior);
  }

  public setSpawnCenter(x: number, z: number): void {
    this._initBehavior.spawnX = x;
    this._initBehavior.spawnZ = z;
  }

  protected createParticleData(): SparkleParticle {
    const cfg = this._config.unitBlockSparkles;
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sprite = new THREE.Mesh(this._geometry, mat);
    sprite.rotation.x = -Math.PI / 2;
    sprite.visible = false;
    this.add(sprite);
    return { sprite, vx: 0, vz: 0 };
  }

  protected disposeParticleData(data: SparkleParticle): void {
    (data.sprite.material as THREE.MeshBasicMaterial).dispose();
  }

  protected attachParticleData(data: SparkleParticle): void {
    data.sprite.visible = true;
  }

  protected detachParticleData(data: SparkleParticle): void {
    data.sprite.visible = false;
  }

  protected override onDestroy(): void {
    this._geometry.dispose();
  }

  /** Build a 5-pointed star centred at (0, 0) by alternating outer
   *  and inner vertices around the circle. `outerR` is the star
   *  tip distance, `innerR` the dip between tips. */
  private static _buildStarShape(outerR: number, innerR: number): THREE.Shape {
    const shape = new THREE.Shape();
    const points = 5;
    const step = (Math.PI * 2) / (points * 2);
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      // Start at the top tip (angle -π/2 = straight up) so the
      // resulting star reads "upright" by default.
      const angle = i * step - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }
}
