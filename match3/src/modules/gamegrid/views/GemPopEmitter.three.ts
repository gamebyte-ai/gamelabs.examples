import * as THREE from "three";
import { WorldParticleEmitter, type IParticleBehavior, type Particle, type ParticleBudget } from "@gamebyte/gamelabsjs";

/** Renderer payload for one spark: its quad plus the motion it was given at spawn. */
type Spark = {
  mesh: THREE.Mesh;
  velocityX: number;
  velocityZ: number;
  spin: number;
  size: number;
};

/**
 * The burst a gem leaves behind when it pops.
 *
 * Built on the framework's particle module rather than hand-rolled tweens: the module
 * owns pooling, the global {@link ParticleBudget}, and the per-frame tick, so a busy
 * cascade cannot spawn unbounded meshes.
 *
 * `rate: 0` — this emitter never emits continuously. It only fires when the board asks
 * it to, via {@link burst}.
 */
export class GemPopEmitter extends WorldParticleEmitter<Spark> {
  private static readonly GEOMETRY = new THREE.PlaneGeometry(1, 1);

  private readonly _color: THREE.Color = new THREE.Color(0xffffff);
  private readonly _origin = new THREE.Vector3();
  private readonly _speed: number;
  private readonly _sparkSize: number;

  public constructor(budget: ParticleBudget, maxParticles: number, speed: number, sparkSize: number) {
    super(budget, { type: "match3.gem-pop", rate: 0, maxParticles, lifetime: { min: 0.22, max: 0.42 } });
    this._speed = speed;
    this._sparkSize = sparkSize;
    this.behaviors.push(new SparkBehavior());
  }

  /**
   * Fires `count` sparks from `origin` (local to this emitter's parent) in the gem's
   * colour. Origin and colour are read by `createParticleData` on the spawns that
   * follow, so they are set immediately before asking for them.
   */
  public burst(origin: THREE.Vector3, color: number, count: number): void {
    this._origin.copy(origin);
    this._color.set(color);
    this.spawn(count);
  }

  /**
   * Allocation only. Everything that varies per spawn is set in
   * {@link attachParticleData} instead, because the pool reuses particles through
   * attach/detach and only ever calls this for genuinely new ones — initialising here
   * left recycled sparks sitting at the previous burst's position and colour, so old
   * cells looked like they were still popping.
   */
  protected override createParticleData(): Spark {
    // Unlit: sparks read as light and never pick up scene colour.
    const mesh = new THREE.Mesh(
      GemPopEmitter.GEOMETRY,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    return { mesh, velocityX: 0, velocityZ: 0, spin: 0, size: this._sparkSize };
  }

  protected override attachParticleData(data: Spark): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = this._speed * (0.45 + Math.random() * 0.55);

    data.velocityX = Math.cos(angle) * speed;
    data.velocityZ = Math.sin(angle) * speed;
    data.spin = (Math.random() - 0.5) * 8;
    data.size = this._sparkSize * (0.6 + Math.random() * 0.8);

    data.mesh.position.copy(this._origin);
    data.mesh.rotation.set(-Math.PI / 2, 0, 0);
    (data.mesh.material as THREE.MeshBasicMaterial).color.copy(this._color);
    (data.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    data.mesh.visible = true;
    this.add(data.mesh);
  }

  protected override detachParticleData(data: Spark): void {
    data.mesh.visible = false;
    data.mesh.removeFromParent();
  }

  protected override disposeParticleData(data: Spark): void {
    // The geometry is shared across every spark, so only the material is ours to free.
    (data.mesh.material as THREE.Material).dispose();
  }
}

/** Drift outward, slow down, shrink and fade over the particle's life. */
class SparkBehavior implements IParticleBehavior<Spark> {
  public init(particle: Particle<Spark>): void {
    particle.data.mesh.scale.setScalar(particle.data.size);
  }

  public update(particle: Particle<Spark>, dtSeconds: number): void {
    const { mesh } = particle.data;
    const drag = 1 - Math.min(1, dtSeconds * 3.2);

    particle.data.velocityX *= drag;
    particle.data.velocityZ *= drag;
    mesh.position.x += particle.data.velocityX * dtSeconds;
    mesh.position.z += particle.data.velocityZ * dtSeconds;
    mesh.rotation.z += particle.data.spin * dtSeconds;

    const remaining = 1 - particle.progress;
    mesh.scale.setScalar(particle.data.size * remaining);
    (mesh.material as THREE.MeshBasicMaterial).opacity = remaining;
  }
}
