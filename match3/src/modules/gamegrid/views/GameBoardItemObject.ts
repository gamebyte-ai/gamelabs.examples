import * as THREE from "three";
import gsap from "gsap";
import type { IAssetManager, IWorldPointerInput, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObject, type IGridObjectListener } from "@gamebyte/gamelabsjs";
import { GEM_ASSET_IDS_BY_TYPE } from "../../../Match3AssetIds.js";
import type { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions.js";

export class GameBoardItemObject extends GridItemObject {
  private static readonly SELECTION_ACCENT = 0xfbbf24;
  private static readonly SELECTION_SCALE = 1.1;
  private static readonly QUAD_Y = 0.06;

  public declare readonly preset: RectGridPreset;

  private _mesh: THREE.Mesh | null = null;
  private _selectionHalo: THREE.Mesh | null = null;

  public constructor(options: GameBoardItemObjectOptions, pointerListener: IGridObjectListener, inputManager: IWorldPointerInput | null, assetManager?: IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  protected override createVisual(): void {
    const gemType = (this._options as GameBoardItemObjectOptions).gemType;
    const size = Math.min(this.preset.columnSize, this.preset.rowSize) * 0.78;

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
