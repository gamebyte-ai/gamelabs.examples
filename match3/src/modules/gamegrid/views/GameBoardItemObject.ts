import * as THREE from "three";
import gsap from "gsap";
import type { IAssetManager, IWorldPointerInput, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObject, type IGridObjectListener } from "@gamebyte/gamelabsjs";
import { GEM_ASSET_IDS_BY_TYPE } from "../../../Match3AssetIds.js";
import { GemSpecial } from "../models/GameBoardItem.js";
import { Match3Config } from "../../../Match3Config.js";
import type { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions.js";

/**
 * Radial black gradient used as the gems' drop shadow, drawn once into a canvas and
 * shared by every gem — a texture per gem would be hundreds of identical uploads.
 * Keyed by softness so a config change still produces the right falloff.
 */
const SHADOW_TEXTURES = new Map<number, THREE.Texture>();

function shadowTexture(softness: number): THREE.Texture {
  const key = Math.round(Math.max(0, Math.min(1, softness)) * 100) / 100;
  const cached = SHADOW_TEXTURES.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, r * key, r, r, r);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  SHADOW_TEXTURES.set(key, texture);
  return texture;
}

/**
 * The cookie face: a disc split into one wedge per gem colour, drawn once and shared.
 * Built from the palette so it always shows the colours actually in play.
 */
let COOKIE_TEXTURE: THREE.Texture | null = null;

function cookieTexture(colors: readonly number[]): THREE.Texture {
  if (COOKIE_TEXTURE) return COOKIE_TEXTURE;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const slice = (Math.PI * 2) / Math.max(1, colors.length);

  for (let i = 0; i < colors.length; i++) {
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.arc(r, r, r * 0.94, i * slice - Math.PI / 2, (i + 1) * slice - Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = `#${colors[i].toString(16).padStart(6, "0")}`;
    ctx.fill();
  }

  // A dark rim reads as an edge against any board colour.
  ctx.beginPath();
  ctx.arc(r, r, r * 0.94, 0, Math.PI * 2);
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = "rgba(15,23,42,0.85)";
  ctx.stroke();

  COOKIE_TEXTURE = new THREE.CanvasTexture(canvas);
  return COOKIE_TEXTURE;
}

/**
 * Letter marks for booster gems, drawn into a canvas once and shared by key. Text is
 * the one thing three.js has no primitive for, so it comes through a texture.
 */
const LABEL_TEXTURES = new Map<string, THREE.Texture>();

function labelTexture(label: string, color: number): THREE.Texture {
  const key = `${label}:${color}`;
  const cached = LABEL_TEXTURES.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `bold ${size * 0.78}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Dark outline first, so the letter holds up over any gem colour.
  ctx.lineWidth = size * 0.09;
  ctx.strokeStyle = "rgba(15,23,42,0.9)";
  ctx.strokeText(label, size / 2, size * 0.54);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillText(label, size / 2, size * 0.54);

  const texture = new THREE.CanvasTexture(canvas);
  LABEL_TEXTURES.set(key, texture);
  return texture;
}

export class GameBoardItemObject extends GridItemObject {
  private static readonly QUAD_Y = 0.06;
  /** Below the gem quad, above the board outline (`0.02`) and backdrop (`0.03`). */
  private static readonly SHADOW_Y = 0.045;
  /** Just above the gem quad so the marks read over the gem art. */
  private static readonly STRIPE_Y = 0.065;
  /** How faint the gem gets at the bottom of a waiting pulse. */
  private static readonly PULSE_MIN_OPACITY = 0.25;

  public declare readonly preset: RectGridPreset;

  /**
   * Everything {@link createVisual} builds is DECLARED, not initialized.
   *
   * The base `GridItemObject` constructor calls `createVisual()` itself, and under
   * ES2022 class-field semantics (`useDefineForClassFields`) a subclass's fields are
   * defined immediately AFTER `super()` returns. An initializer here — even a bare
   * declaration, which still emits `field = undefined` — therefore runs after
   * `createVisual` and wipes what it just assigned.
   *
   * That is why every attempt at a pulse failed: `_mesh` was null by the time anything
   * could tint it, so the code had nothing to act on and failed silently. `declare`
   * emits no field at all, which leaves the constructor's assignments standing.
   */
  private declare _mesh: THREE.Mesh | null;
  /** Mask layer for the pulse — the gem's silhouette in a flat colour. Built on demand. */
  private _flash: THREE.Mesh | null = null;
  private declare _texture: THREE.Texture | null;
  private declare _selectionHalo: THREE.Mesh | null;
  private declare _shadow: THREE.Mesh | null;

  public constructor(options: GameBoardItemObjectOptions, pointerListener: IGridObjectListener, inputManager: IWorldPointerInput | null, assetManager?: IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  protected override createVisual(): void {
    const options = this._options as GameBoardItemObjectOptions;
    const gemType = options.gemType;
    // A merged bomb+stripe covers a whole block of cells, so it is drawn that many
    // times oversize. Everything below — shadow, stripes, halo — measures from `size`,
    // so the one factor scales the item as a piece.
    const span = options.special === GemSpecial.GiantStripe ? Math.max(1, options.giantSpanCells) : 1;
    const size = Math.min(this.preset.columnSize, this.preset.rowSize) * 0.78 * span;

    // Shadow first, so it is behind the gem in both height and draw order. Offsetting
    // it in the board plane is what reads as the gem floating above the board under a
    // straight top-down camera.
    const shadowOpts = options.shadow;
    if (shadowOpts && shadowOpts.opacity > 0) {
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(size * shadowOpts.scale, size * shadowOpts.scale),
        new THREE.MeshBasicMaterial({
          map: shadowTexture(shadowOpts.softness),
          transparent: true,
          opacity: shadowOpts.opacity,
          depthWrite: false
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(shadowOpts.offsetX, GameBoardItemObject.SHADOW_Y, shadowOpts.offsetZ);
      this.add(shadow);
      this._shadow = shadow;
    }

    const isBooster = options.special === GemSpecial.Booster;
    const isCookie = options.special === GemSpecial.ColorBomb;
    // Stripes describe a sweep direction; neither a cookie nor a booster has one — their
    // faces say what they are.
    if (!isCookie && !isBooster) this._createStripes(options, size);

    // Gem texture quad — or the cookie face, which is generated rather than loaded.
    const assetId = GEM_ASSET_IDS_BY_TYPE[gemType % GEM_ASSET_IDS_BY_TYPE.length];
    const texture = isCookie
      ? cookieTexture(Match3Config.GEM_PALETTE)
      : assetId
        ? this._assetManager?.getAsset<THREE.Texture>(assetId) ?? null
        : null;

    if (import.meta.env.DEV && !isCookie && !texture) {
      // eslint-disable-next-line no-console
      console.warn(
        `[match3] createVisual could not resolve a gem texture — assetId=${assetId} ` +
          `assetManager=${this._assetManager ? "present" : "NULL"}`
      );
    }

    const geom = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, GameBoardItemObject.QUAD_Y, 0);
    this.add(mesh);
    this._mesh = mesh;
    this._texture = texture;

    // Selection halo ring
    const haloR = size * 0.55;
    const haloGeom = new THREE.RingGeometry(haloR * 0.78, haloR, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: options.selection.color,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, GameBoardItemObject.QUAD_Y + 0.01, 0);
    halo.visible = false;
    halo.renderOrder = 99;
    this.add(halo);
    this._selectionHalo = halo;

    if (isBooster) this._createBoosterLabel(options, size);
  }

  /** The booster's letter, sitting over the gem art so it stays legible. */
  private _createBoosterLabel(options: GameBoardItemObjectOptions, size: number): void {
    const booster = options.booster;
    if (!booster || booster.labelScale <= 0) return;

    const side = size * booster.labelScale;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(side, side),
      new THREE.MeshBasicMaterial({
        map: labelTexture(booster.label, booster.labelColor),
        transparent: true,
        depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, GameBoardItemObject.STRIPE_Y, 0);
    this.add(mesh);
  }

  /**
   * Two bars across the gem showing which way a striped gem will sweep when cleared.
   * Drawn ABOVE the gem quad so they stay readable over any gem art, and parented to
   * the gem so they travel, grow and pop with it.
   */
  private _createStripes(options: GameBoardItemObjectOptions, size: number): void {
    const special = options.special;
    if (special === GemSpecial.None) return;

    const stripe = options.stripe;
    // The merged item is a stripe drawn large; its bars run the same way a row stripe's do.
    const alongRow = special === GemSpecial.StripedRow || special === GemSpecial.GiantStripe;
    const thickness = size * stripe.stripeThickness;
    const material = new THREE.MeshBasicMaterial({
      color: stripe.stripeColor,
      transparent: true,
      opacity: stripe.stripeOpacity,
      depthWrite: false
    });

    for (const sign of [-1, 1]) {
      const offset = size * stripe.stripeGap * 0.5 * sign;
      const bar = new THREE.Mesh(
        // Bars run the full width of the gem along the sweep axis.
        alongRow ? new THREE.PlaneGeometry(size, thickness) : new THREE.PlaneGeometry(thickness, size),
        material
      );
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(alongRow ? 0 : offset, GameBoardItemObject.STRIPE_Y, alongRow ? offset : 0);
      this.add(bar);
    }
  }

  /** The gem's colour index, for effects that need to match it (the pop burst). */
  public get gemType(): number {
    return (this._options as GameBoardItemObjectOptions).gemType;
  }

  /**
   * Fades the gem for the waiting pulse: `amount` 0 leaves it untouched, 1 takes it to
   * `PULSE_MIN_OPACITY`. `null` restores it.
   *
   * Drawn as a MASK: the gem's texture supplies the shape and nothing else, and the
   * layer is filled with a flat colour. Straight opacity on the gem itself only dims it,
   * and an additive copy tints by the gem's own colours instead of reaching white — a
   * multiply material cannot go toward white at all. The mask is the only one of the
   * three that gives the same flash on every gem.
   */
  public setTint(amount: number | null): void {
    const t = amount === null ? 0 : Math.max(0, Math.min(1, amount));
    const flash = this._ensureFlash();
    if (flash) {
      const options = this._options as GameBoardItemObjectOptions;
      const material = flash.material as THREE.ShaderMaterial;
      material.uniforms.uOpacity.value = t * options.booster.blinkStrength;
      flash.visible = t > 0;
      return;
    }

    // No texture to mask with — dim the gem instead. Less of a flash, but it is the one
    // thing that works without one.
    const material = this._mesh?.material as THREE.MeshBasicMaterial | undefined;
    if (!material) return;
    material.transparent = true;
    material.opacity = 1 - t * (1 - GameBoardItemObject.PULSE_MIN_OPACITY);
  }

  /**
   * The pulse layer, built the first time it is needed.
   *
   * It reuses the gem's geometry and takes ONLY the alpha of its texture, filling that
   * silhouette with a flat colour — a mask, not a copy. `MeshBasicMaterial` cannot do
   * this: `map` supplies rgb as well as alpha and `color` multiplies it, so a coloured
   * gem can never be flashed to white through it. Four lines of shader can.
   *
   * Without a texture there is no silhouette to fill, and a plain quad would light the
   * whole cell — so that case falls back to dimming the gem instead.
   */
  private _ensureFlash(): THREE.Mesh | null {
    if (this._flash) return this._flash;
    if (!this._mesh || !this._texture) return null;

    const options = this._options as GameBoardItemObjectOptions;
    const flash = new THREE.Mesh(
      this._mesh.geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: this._texture },
          uColor: { value: new THREE.Color(options.booster.blinkColor) },
          uOpacity: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            float mask = texture2D(uMap, vUv).a;
            if (mask < 0.01) discard;
            gl_FragColor = vec4(uColor, mask * uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false
      })
    );
    flash.rotation.x = -Math.PI / 2;
    // A hair above the gem quad, under the stripe marks, so it never z-fights.
    flash.position.set(0, GameBoardItemObject.QUAD_Y + 0.002, 0);
    flash.visible = false;
    this.add(flash);
    this._flash = flash;
    return flash;
  }

  public setHighlighted(on: boolean): void {
    const selection = (this._options as GameBoardItemObjectOptions).selection;
    if (this._selectionHalo) this._selectionHalo.visible = on && selection.enabled;
    this.scale.setScalar(on && selection.enabled ? selection.scale : 1);
  }

  public killAnimations(): void {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.position);
    gsap.killTweensOf(this.scale);
  }

  protected override createCollider(): void {}
}
