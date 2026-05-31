import * as THREE from "three";
import {
  WorldParticleEmitter,
  type IParticleBehavior,
  type Particle,
  type ParticleBudget,
} from "@gamebyte/gamelabsjs";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { BUBBLE_COLOR_HEX, type BubbleColor } from "../constants/BubbleColor";
import { PlayAreaClipping } from "./PlayAreaClipping";

const PARTICLE_SEGMENTS = 10;
const PARTICLE_Z = 0.5;
/**
 * Cap on simultaneous in-flight pop-burst particles. The biggest single
 * frame is a `bombBlastRingCount = 2` blast (19 cells) × `popParticleCount`
 * — so the cap above that comfortably absorbs back-to-back bursts.
 */
const POP_BURST_MAX_PARTICLES = 256;

interface IPopBurstParticle {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
}

/**
 * Per-burst spawn state + per-particle init / update behaviour.
 * The emitter mutates {@link spawnX} / {@link spawnY} / {@link spawnColorHex}
 * before calling `spawn(n)`; each particle's init reads those fields,
 * picks a random outward direction + speed inside the configured
 * range, and tints its own material to the burst's source colour.
 * Update is linear motion + linear opacity fade.
 */
class PopBurstBehavior implements IParticleBehavior<IPopBurstParticle> {
  public spawnX = 0;
  public spawnY = 0;
  public spawnColorHex = 0xffffff;

  public constructor(private readonly _config: BubbleShooterConfig) {}

  public init(p: Particle<IPopBurstParticle>): void {
    const config = this._config;
    const angle = Math.random() * Math.PI * 2;
    const speed =
      config.popParticleSpeedMin + Math.random() * (config.popParticleSpeedMax - config.popParticleSpeedMin);
    p.data.mesh.position.set(this.spawnX, this.spawnY, PARTICLE_Z);
    p.data.material.color.setHex(this.spawnColorHex);
    p.data.material.opacity = 1;
    p.data.vx = Math.cos(angle) * speed;
    p.data.vy = Math.sin(angle) * speed;
  }

  public update(p: Particle<IPopBurstParticle>, dt: number): void {
    p.data.mesh.position.x += p.data.vx * dt;
    p.data.mesh.position.y += p.data.vy * dt;
    p.data.material.opacity = 1 - p.progress;
  }
}

/**
 * Pop-burst FX as a {@link WorldParticleEmitter}. Each call to
 * {@link burst} fires `popParticleCount` particles outward from the
 * given world position, tinted by the popped bubble's colour. The
 * `ParticleManager` ticks the emitter; we don't need a per-frame
 * subscription. Each particle owns its own `MeshBasicMaterial` so
 * concurrent bursts of different colours can coexist in the pool —
 * the shared geometry keeps GPU cost low.
 */
export class PopBurstEmitter extends WorldParticleEmitter<IPopBurstParticle> {
  private readonly _config: BubbleShooterConfig;
  private readonly _clipping: PlayAreaClipping | null;
  private readonly _geometry: THREE.CircleGeometry;
  private readonly _behavior: PopBurstBehavior;

  public constructor(budget: ParticleBudget, config: BubbleShooterConfig, clipping: PlayAreaClipping | null) {
    super(budget, {
      type: "fx.popBurst",
      rate: 0,
      maxParticles: POP_BURST_MAX_PARTICLES,
      lifetime: { min: config.popParticleLifetimeSeconds, max: config.popParticleLifetimeSeconds },
      priority: 5,
    });
    this._config = config;
    this._clipping = clipping;
    this._geometry = new THREE.CircleGeometry(config.popParticleRadius, PARTICLE_SEGMENTS);
    this._behavior = new PopBurstBehavior(config);
    this.behaviors.push(this._behavior);
  }

  public burst(x: number, y: number, color: BubbleColor): number {
    this._behavior.spawnX = x;
    this._behavior.spawnY = y;
    this._behavior.spawnColorHex = BUBBLE_COLOR_HEX[color];
    return this.spawn(this._config.popParticleCount);
  }

  protected createParticleData(): IPopBurstParticle {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      clippingPlanes: this._clipping?.planes,
    });
    const mesh = new THREE.Mesh(this._geometry, material);
    mesh.renderOrder = 12;
    mesh.visible = false;
    this.add(mesh);
    return { mesh, material, vx: 0, vy: 0 };
  }

  protected disposeParticleData(data: IPopBurstParticle): void {
    data.material.dispose();
  }

  protected attachParticleData(data: IPopBurstParticle): void {
    data.mesh.visible = true;
  }

  protected detachParticleData(data: IPopBurstParticle): void {
    data.mesh.visible = false;
  }

  protected override onDestroy(): void {
    this._geometry.dispose();
  }
}
