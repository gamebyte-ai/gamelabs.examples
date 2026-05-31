import * as THREE from "three";
import {
  WorldParticleEmitter,
  type IParticleBehavior,
  type Particle,
  type ParticleBudget,
} from "@gamebyte/gamelabsjs";
import { AvoidanceConfig } from "../AvoidanceConfig.js";

export type PropulsionParticle = {
  sprite: THREE.Mesh;
  vx: number;
  vy: number;
};

class PropulsionInitBehavior implements IParticleBehavior<PropulsionParticle> {
  public spawnX = 0;
  public spawnY = 0;
  public ejectDx = 0;
  public ejectDy = 0;

  public constructor(private readonly _config: AvoidanceConfig) {}

  public init(p: Particle<PropulsionParticle>): void {
    const { sprite } = p.data;
    sprite.position.set(this.spawnX, 0.03, this.spawnY);
    const jitter = (Math.random() - 0.5) * this._config.propulsionAngleJitterRad;
    const cs = Math.cos(jitter);
    const sn = Math.sin(jitter);
    const dx = this.ejectDx * cs - this.ejectDy * sn;
    const dy = this.ejectDx * sn + this.ejectDy * cs;
    const speed =
      this._config.propulsionEjectSpeedMin +
      Math.random() * (this._config.propulsionEjectSpeedMax - this._config.propulsionEjectSpeedMin);
    p.data.vx = dx * speed;
    p.data.vy = dy * speed;
    sprite.scale.setScalar(this._config.propulsionStartScale);
    (sprite.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  public update(p: Particle<PropulsionParticle>, dt: number): void {
    const { sprite } = p.data;
    sprite.position.x += p.data.vx * dt;
    sprite.position.z += p.data.vy * dt;
    const decay = 1 - dt * this._config.propulsionDrag;
    p.data.vx *= decay;
    p.data.vy *= decay;
    // Grow from start to end scale linearly across life.
    const t = p.progress;
    const scale =
      this._config.propulsionStartScale + (this._config.propulsionEndScale - this._config.propulsionStartScale) * t;
    sprite.scale.setScalar(scale);
    // Quadratic fade — stays near full opacity early, falls off faster near end of life.
    (sprite.material as THREE.MeshBasicMaterial).opacity = 1 - t * t;
  }
}

/**
 * Propulsion trail emitter. Lives in world space (not parented to the
 * player) so spawned particles drift in the world frame and look like
 * they're left behind. The view drives spawn position / direction /
 * rate each frame from the player's velocity.
 */
export class PropulsionEmitter extends WorldParticleEmitter<PropulsionParticle> {
  private readonly _config: AvoidanceConfig;
  private readonly _texture: THREE.Texture;
  private readonly _geometry: THREE.PlaneGeometry;
  private readonly _initBehavior: PropulsionInitBehavior;

  public constructor(budget: ParticleBudget, config: AvoidanceConfig, texture: THREE.Texture) {
    super(budget, {
      type: "fx.propulsion",
      rate: 0,
      maxParticles: config.propulsionMaxParticles,
      lifetime: { min: config.propulsionLifetimeMin, max: config.propulsionLifetimeMax },
    });
    this._config = config;
    this._texture = texture;
    this._geometry = new THREE.PlaneGeometry(config.propulsionParticleSize, config.propulsionParticleSize);
    this._initBehavior = new PropulsionInitBehavior(config);
    this.behaviors.push(this._initBehavior);
  }

  /** Set the next-spawn world position and ejection direction (already opposite to motion, normalized). */
  public setSpawnState(x: number, y: number, ejectDx: number, ejectDy: number): void {
    this._initBehavior.spawnX = x;
    this._initBehavior.spawnY = y;
    this._initBehavior.ejectDx = ejectDx;
    this._initBehavior.ejectDy = ejectDy;
  }

  protected createParticleData(): PropulsionParticle {
    // White texture × `color` = tinted soft puff. Shared geometry +
    // shared texture across the pool; only the per-particle material
    // is unique because opacity is animated independently.
    const mat = new THREE.MeshBasicMaterial({
      map: this._texture,
      color: this._config.propulsionParticleColor,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Mesh(this._geometry, mat);
    sprite.rotation.x = -Math.PI / 2;
    sprite.visible = false;
    this.add(sprite);
    return { sprite, vx: 0, vy: 0 };
  }

  protected disposeParticleData(data: PropulsionParticle): void {
    (data.sprite.material as THREE.MeshBasicMaterial).dispose();
  }

  protected attachParticleData(data: PropulsionParticle): void {
    data.sprite.visible = true;
  }

  protected detachParticleData(data: PropulsionParticle): void {
    data.sprite.visible = false;
  }

  protected override onDestroy(): void {
    this._geometry.dispose();
  }
}
