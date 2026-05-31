import * as THREE from "three";
import {
  WorldParticleEmitter,
  type IParticleBehavior,
  type Particle,
  type ParticleBudget,
} from "@gamebyte/gamelabsjs";
import { AvoidanceConfig } from "../AvoidanceConfig.js";

export type ExplosionParticle = {
  sprite: THREE.Mesh;
  vx: number;
  vy: number;
};

class ExplosionInitBehavior implements IParticleBehavior<ExplosionParticle> {
  public spawnX = 0;
  public spawnY = 0;

  public constructor(private readonly _config: AvoidanceConfig) {}

  public init(p: Particle<ExplosionParticle>): void {
    const { sprite } = p.data;
    sprite.position.set(this.spawnX, 0.05, this.spawnY);
    const angle = Math.random() * Math.PI * 2;
    const speed =
      this._config.explosionEjectSpeedMin +
      Math.random() * (this._config.explosionEjectSpeedMax - this._config.explosionEjectSpeedMin);
    p.data.vx = Math.cos(angle) * speed;
    p.data.vy = Math.sin(angle) * speed;
    sprite.scale.setScalar(0.6 + Math.random() * 0.6);
    (sprite.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  public update(p: Particle<ExplosionParticle>, dt: number): void {
    const { sprite } = p.data;
    sprite.position.x += p.data.vx * dt;
    sprite.position.z += p.data.vy * dt;
    const decay = 1 - dt * this._config.explosionDrag;
    p.data.vx *= decay;
    p.data.vy *= decay;
    (sprite.material as THREE.MeshBasicMaterial).opacity = 1 - p.progress;
  }
}

/**
 * One-shot radial explosion emitter. The view positions it at the
 * collision point and calls `burst(x, y, n)` once; particles fly
 * outward, drag down, fade out.
 */
export class ExplosionEmitter extends WorldParticleEmitter<ExplosionParticle> {
  private readonly _config: AvoidanceConfig;
  private readonly _texture: THREE.Texture;
  private readonly _geometry: THREE.PlaneGeometry;
  private readonly _initBehavior: ExplosionInitBehavior;

  public constructor(budget: ParticleBudget, config: AvoidanceConfig, texture: THREE.Texture) {
    super(budget, {
      type: "fx.explosion",
      rate: 0,
      maxParticles: config.explosionMaxParticles,
      lifetime: { min: config.explosionLifetimeMin, max: config.explosionLifetimeMax },
      priority: 10,
    });
    this._config = config;
    this._texture = texture;
    this._geometry = new THREE.PlaneGeometry(config.explosionParticleSize, config.explosionParticleSize);
    this._initBehavior = new ExplosionInitBehavior(config);
    this.behaviors.push(this._initBehavior);
  }

  public burst(x: number, y: number, count: number): number {
    this._initBehavior.spawnX = x;
    this._initBehavior.spawnY = y;
    return this.spawn(count);
  }

  protected createParticleData(): ExplosionParticle {
    const mat = new THREE.MeshBasicMaterial({
      map: this._texture,
      color: this._config.explosionParticleColor,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Mesh(this._geometry, mat);
    sprite.rotation.x = -Math.PI / 2;
    sprite.visible = false;
    this.add(sprite);
    return { sprite, vx: 0, vy: 0 };
  }

  protected disposeParticleData(data: ExplosionParticle): void {
    (data.sprite.material as THREE.MeshBasicMaterial).dispose();
  }

  protected attachParticleData(data: ExplosionParticle): void {
    data.sprite.visible = true;
  }

  protected detachParticleData(data: ExplosionParticle): void {
    data.sprite.visible = false;
  }

  protected override onDestroy(): void {
    this._geometry.dispose();
  }
}
