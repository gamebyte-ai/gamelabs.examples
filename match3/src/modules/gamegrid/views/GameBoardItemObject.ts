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

export class GameBoardItemObject extends GridItemObject {
  private static readonly SELECTION_ACCENT = 0xfbbf24;
  private static readonly SELECTION_SCALE = 1.1;
  private static readonly QUAD_Y = 0.06;
  /** Below the gem quad, above the board outline (`0.02`) and backdrop (`0.03`). */
  private static readonly SHADOW_Y = 0.045;
  /** Just above the gem quad so the marks read over the gem art. */
  private static readonly STRIPE_Y = 0.065;

  public declare readonly preset: RectGridPreset;

  private _mesh: THREE.Mesh | null = null;
  private _selectionHalo: THREE.Mesh | null = null;
  private _shadow: THREE.Mesh | null = null;

  public constructor(options: GameBoardItemObjectOptions, pointerListener: IGridObjectListener, inputManager: IWorldPointerInput | null, assetManager?: IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  protected override createVisual(): void {
    const options = this._options as GameBoardItemObjectOptions;
    const gemType = options.gemType;
    const size = Math.min(this.preset.columnSize, this.preset.rowSize) * 0.78;

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

    const isCookie = options.special === GemSpecial.ColorBomb;
    // Stripes describe a sweep direction; a cookie has none, its face says what it is.
    if (!isCookie) this._createStripes(options, size);

    // Gem texture quad — or the cookie face, which is generated rather than loaded.
    const assetId = GEM_ASSET_IDS_BY_TYPE[gemType % GEM_ASSET_IDS_BY_TYPE.length];
    const texture = isCookie
      ? cookieTexture(Match3Config.GEM_PALETTE)
      : assetId
        ? this._assetManager?.getAsset<THREE.Texture>(assetId) ?? null
        : null;

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

    // Selection halo ring
    const haloR = size * 0.55;
    const haloGeom = new THREE.RingGeometry(haloR * 0.78, haloR, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: GameBoardItemObject.SELECTION_ACCENT,
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
    const alongRow = special === GemSpecial.StripedRow;
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

  public setHighlighted(on: boolean): void {
    if (this._selectionHalo) this._selectionHalo.visible = on;
    this.scale.setScalar(on ? GameBoardItemObject.SELECTION_SCALE : 1);
  }

  public killAnimations(): void {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.position);
    gsap.killTweensOf(this.scale);
  }

  protected override createCollider(): void {}
}
