import * as PIXI from "pixi.js";
import { HudParticleEmitter, type IParticleBehavior, type Particle, type ParticleBudget } from "@gamebyte/gamelabsjs";
import { MergeGameConfig } from "../MergeGameConfig.js";

/** The star texture's drawn radius as a fraction of its size (see genassets: outer 0.46). */
const STAR_TEX_FRAC = 0.46;

/** One live star: its sprite + current velocity/spin. */
interface StarParticle {
  sprite: PIXI.Sprite;
  vx: number;
  vy: number;
  spin: number;
}

/** Spawn + per-frame motion: fling each star out radially, drag it down, fade it. */
class StarBehavior implements IParticleBehavior<StarParticle> {
  public spawnX = 0;
  public spawnY = 0;

  public constructor(
    private readonly _cfg: MergeGameConfig,
    private readonly _baseScale: number,
  ) {}

  public init(p: Particle<StarParticle>): void {
    const s = this._cfg.effects.stars;
    const sp = p.data.sprite;
    sp.position.set(this.spawnX, this.spawnY);
    const angle = Math.random() * Math.PI * 2;
    const speed = s.speed * (0.5 + Math.random() * 0.7);
    p.data.vx = Math.cos(angle) * speed;
    p.data.vy = Math.sin(angle) * speed;
    p.data.spin = (Math.random() < 0.5 ? -1 : 1) * s.spin * (0.5 + Math.random());
    sp.rotation = Math.random() * Math.PI * 2;
    sp.alpha = 1;
    sp.tint = s.color;
    sp.scale.set(this._baseScale * (0.6 + Math.random() * 0.6));
  }

  public update(p: Particle<StarParticle>, dt: number): void {
    const s = this._cfg.effects.stars;
    const sp = p.data.sprite;
    sp.x += p.data.vx * dt;
    sp.y += p.data.vy * dt;
    const decay = Math.max(0, 1 - s.drag * dt);
    p.data.vx *= decay;
    p.data.vy *= decay;
    p.data.vy += s.gravity * dt;
    sp.rotation += p.data.spin * dt;
    sp.alpha = 1 - p.progress; // fade out over its lifetime
  }
}

/**
 * One-shot star burst on the HUD (2D). Built on the framework
 * `HudParticleEmitter` (a Pixi `Container`): the view adds it, calls
 * `burst(x, y, n)` when the merged item appears, and `update(dt)` each frame.
 * Particles are sprites of the loaded star texture, tinted by config color.
 */
export class StarburstEmitter extends HudParticleEmitter<StarParticle> {
  private readonly _texture: PIXI.Texture;
  private readonly _behavior: StarBehavior;

  public constructor(budget: ParticleBudget, cfg: MergeGameConfig, texture: PIXI.Texture) {
    const s = cfg.effects.stars;
    super(budget, {
      type: "fx.stars",
      rate: 0, // spawn only on explicit burst()
      maxParticles: s.max,
      lifetime: { min: s.time.min, max: s.time.max },
      priority: 10,
    });
    this._texture = texture;
    // Scale so a star's drawn radius ≈ config `size` at unit random factor.
    const baseScale = s.size / Math.max(1, texture.width * STAR_TEX_FRAC);
    this._behavior = new StarBehavior(cfg, baseScale);
    this.behaviors.push(this._behavior);
  }

  /** Fire `count` stars outward from a design-space point. */
  public burst(x: number, y: number, count: number): number {
    this._behavior.spawnX = x;
    this._behavior.spawnY = y;
    return this.spawn(count);
  }

  protected createParticleData(): StarParticle {
    const sp = new PIXI.Sprite(this._texture);
    sp.anchor.set(0.5);
    sp.visible = false;
    sp.eventMode = "none";
    this.addChild(sp);
    return { sprite: sp, vx: 0, vy: 0, spin: 0 };
  }

  protected disposeParticleData(data: StarParticle): void {
    data.sprite.destroy();
  }

  protected attachParticleData(data: StarParticle): void {
    data.sprite.visible = true;
  }

  protected detachParticleData(data: StarParticle): void {
    data.sprite.visible = false;
  }
}
