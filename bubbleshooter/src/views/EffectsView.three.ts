import * as THREE from "three";
import { ParticleBudget, WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IEffectsView } from "./IEffectsView";
import { PopBurstEmitter } from "./PopBurstEmitter.three";
import { PlayAreaClipping } from "./PlayAreaClipping";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { BUBBLE_COLOR_HEX, type BubbleColor } from "../constants/BubbleColor";

const SCORE_POPUP_Z = 0.6;
const SCORE_POPUP_CANVAS_W = 192;
const SCORE_POPUP_CANVAS_H = 72;

interface IScorePopup {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.PlaneGeometry;
  readonly material: THREE.MeshBasicMaterial;
  readonly canvas: HTMLCanvasElement;
  readonly canvasCtx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  startY: number;
  rise: number;
  age: number;
  lifetime: number;
}

/**
 * Pop-feedback effects layer — particle bursts (delegated to a
 * {@link PopBurstEmitter} ticked by `ParticleManager`) and floating
 * score popups (kept manual: each popup is a one-shot canvas-textured
 * plane, not a many-particles-per-spawn pattern). The view owns the
 * emitter's mesh + materials + scene-graph parenting; the controller
 * resolves `ParticleManager` (which lives on the main DI container,
 * not the view DI container — same split avoidance uses) and
 * `register`s the emitter. Score popups are still pooled here because
 * they're 1-per-event with non-trivial canvas + texture resources we
 * don't want to churn.
 */
export class EffectsView extends WorldViewBase implements IEffectsView {
  private _config: BubbleShooterConfig | null = null;
  private _clipping: PlayAreaClipping | null = null;
  private _budget: ParticleBudget | null = null;
  private _popBurstEmitter: PopBurstEmitter | null = null;

  private readonly _scorePopups: IScorePopup[] = [];
  private readonly _scorePopupPool: IScorePopup[] = [];

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._clipping = resolver.getInstance(PlayAreaClipping);
    // ParticleBudget is mirrored on viewDiContainer by ParticlesBinding
    // for exactly this — views need the budget to construct emitters,
    // but ParticleManager stays on the main DI container so only
    // controllers register / unregister.
    this._budget = resolver.getInstance(ParticleBudget);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config;
    const budget = this._budget;
    if (!config || !budget) return;
    this._popBurstEmitter = new PopBurstEmitter(budget, config, this._clipping);
    // Parent the emitter to this view so its particles inherit our
    // transform (the view sits at the GameAreaView origin, which is
    // the play-area centre — same coords pop events use). Manager
    // registration happens in `EffectsViewController.initialize`.
    this.add(this._popBurstEmitter);
  }

  /** Exposed to the controller so it can register with `ParticleManager`. Throws if accessed before `postInitialize`. */
  public get popBurstEmitter(): PopBurstEmitter {
    if (!this._popBurstEmitter) throw new Error("popBurstEmitter accessed before postInitialize");
    return this._popBurstEmitter;
  }

  public playPopBurst(x: number, y: number, color: BubbleColor): void {
    this._popBurstEmitter?.burst(x, y, color);
  }

  public playScorePopup(x: number, y: number, color: BubbleColor, points: number): void {
    if (points <= 0) return;
    const config = this._config;
    if (!config) return;
    const popup = this._acquireScorePopup();
    if (!popup) return;
    this._renderScorePopupCanvas(popup, color, points);
    popup.mesh.position.set(x, y, SCORE_POPUP_Z);
    popup.material.opacity = 1;
    popup.startY = y;
    popup.rise = config.scorePopupRise;
    popup.age = 0;
    popup.lifetime = config.scorePopupLifetimeSeconds;
    this.add(popup.mesh);
    this._scorePopups.push(popup);
  }

  public updateScorePopups(dt: number): void {
    for (let i = this._scorePopups.length - 1; i >= 0; i--) {
      const p = this._scorePopups[i]!;
      p.age += dt;
      if (p.age >= p.lifetime) {
        // Pool the canvas / texture / material / mesh for the next pop
        // so a 19-cell bomb burst doesn't churn 19 GPU textures.
        this.remove(p.mesh);
        this._scorePopups.splice(i, 1);
        this._scorePopupPool.push(p);
        continue;
      }
      const t = p.age / p.lifetime;
      p.mesh.position.y = p.startY + p.rise * t;
      p.material.opacity = 1 - t;
    }
  }

  private _acquireScorePopup(): IScorePopup | null {
    const pooled = this._scorePopupPool.pop();
    if (pooled) return pooled;
    return this._buildScorePopup();
  }

  private _buildScorePopup(): IScorePopup | null {
    const config = this._config;
    if (!config) return null;
    const cw = SCORE_POPUP_CANVAS_W;
    const ch = SCORE_POPUP_CANVAS_H;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const planeWidth = config.scorePopupWidth;
    const planeHeight = (planeWidth * ch) / cw;
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 15;
    return {
      mesh,
      geometry,
      material,
      canvas,
      canvasCtx,
      texture,
      startY: 0,
      rise: 0,
      age: 0,
      lifetime: 0,
    };
  }

  private _renderScorePopupCanvas(popup: IScorePopup, color: BubbleColor, points: number): void {
    const cw = SCORE_POPUP_CANVAS_W;
    const ch = SCORE_POPUP_CANVAS_H;
    const ctx = popup.canvasCtx;
    ctx.clearRect(0, 0, cw, ch);
    const colorHex = BUBBLE_COLOR_HEX[color];
    const r = (colorHex >> 16) & 0xff;
    const g = (colorHex >> 8) & 0xff;
    const b = colorHex & 0xff;
    ctx.font = "bold 52px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.lineWidth = 6;
    const text = `+${points}`;
    ctx.strokeText(text, cw / 2, ch / 2);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillText(text, cw / 2, ch / 2);
    popup.texture.needsUpdate = true;
  }

  public override preDestroy(): void {
    // Controller has already unregistered + destroyed the emitter via
    // `ParticleManager` by this point; we just detach it from the
    // scene graph.
    if (this._popBurstEmitter) {
      this.remove(this._popBurstEmitter);
    }
    this._popBurstEmitter = null;
    this._budget = null;
    this._clipping = null;

    for (const p of this._scorePopups) {
      this.remove(p.mesh);
      p.geometry.dispose();
      p.material.dispose();
      p.texture.dispose();
    }
    this._scorePopups.length = 0;
    for (const p of this._scorePopupPool) {
      p.geometry.dispose();
      p.material.dispose();
      p.texture.dispose();
    }
    this._scorePopupPool.length = 0;

    this._config = null;
    super.preDestroy();
  }
}
