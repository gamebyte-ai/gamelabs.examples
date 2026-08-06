import * as THREE from "three";
import gsap from "gsap";
import type { IAssetManager, IWorldPointerInput, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObject, type IGridObjectListener } from "@gamebyte/gamelabsjs";
import { GEM_ASSET_IDS_BY_TYPE } from "../../../Match3AssetIds.js";
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

export class GameBoardItemObject extends GridItemObject {
  private static readonly SELECTION_ACCENT = 0xfbbf24;
  private static readonly SELECTION_SCALE = 1.1;
  private static readonly QUAD_Y = 0.06;
  /** Below the gem quad, above the board outline (`0.02`) and backdrop (`0.03`). */
  private static readonly SHADOW_Y = 0.045;

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

    // Gem texture quad
    const assetId = GEM_ASSET_IDS_BY_TYPE[gemType % GEM_ASSET_IDS_BY_TYPE.length];
    const texture = assetId ? this._assetManager?.getAsset<THREE.Texture>(assetId) ?? null : null;

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
