import * as THREE from "three";
import { WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IFallingBubblesView } from "./IFallingBubblesView";
import { PlayAreaClipping } from "./PlayAreaClipping";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { ALL_BUBBLE_COLORS, BUBBLE_COLOR_HEX, type BubbleColor } from "../constants/BubbleColor";
import { BUBBLE_COLOR_TO_ASSET_ID } from "../BubbleShooterAssetIds";

const BUBBLE_DISC_SEGMENTS = 48;
const BUBBLE_VISUAL_RADIUS_FACTOR = 0.94;

/**
 * Falling-bubble layer: keeps a `Map<id, Mesh>` of disconnected
 * bubbles in mid-fall. Position updates come straight from ops via
 * `onFallingBubbleChanged`; the view only owns mesh lifetime.
 *
 * Builds its own copy of bubble geometry + materials (same texture
 * pool as other bubble-shaped sub-views; the texture itself is
 * managed by the AssetManager so duplication is just a few
 * lightweight material wrappers).
 */
export class FallingBubblesView extends WorldViewBase implements IFallingBubblesView {
  private _config: BubbleShooterConfig | null = null;
  private _clipping: PlayAreaClipping | null = null;
  private _bubbleGeometry: THREE.CircleGeometry | null = null;
  private readonly _bubbleMaterials = new Map<BubbleColor, THREE.MeshBasicMaterial>();
  private readonly _meshes = new Map<number, THREE.Mesh>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._clipping = resolver.getInstance(PlayAreaClipping);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config;
    if (!config) return;
    this._bubbleGeometry = new THREE.CircleGeometry(
      config.bubbleRadius * BUBBLE_VISUAL_RADIUS_FACTOR,
      BUBBLE_DISC_SEGMENTS,
    );
    const clippingPlanes = this._clipping?.planes;
    for (const color of ALL_BUBBLE_COLORS) {
      const tex = this.assetLoader.getAsset<THREE.Texture>(BUBBLE_COLOR_TO_ASSET_ID[color]);
      this._bubbleMaterials.set(
        color,
        tex
          ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, clippingPlanes })
          : new THREE.MeshBasicMaterial({ color: BUBBLE_COLOR_HEX[color], transparent: true, depthWrite: false, clippingPlanes }),
      );
    }
  }

  public setFallingBubble(id: number, color: BubbleColor | null, x: number, y: number): void {
    if (color === null) {
      const mesh = this._meshes.get(id);
      if (!mesh) return;
      this.remove(mesh);
      this._meshes.delete(id);
      return;
    }
    const geometry = this._bubbleGeometry;
    const material = this._bubbleMaterials.get(color);
    if (!geometry || !material) return;
    let mesh = this._meshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(geometry, material);
      this._meshes.set(id, mesh);
      this.add(mesh);
    }
    mesh.position.set(x, y, 0);
  }

  public override preDestroy(): void {
    for (const mesh of this._meshes.values()) this.remove(mesh);
    this._meshes.clear();
    for (const mat of this._bubbleMaterials.values()) mat.dispose();
    this._bubbleMaterials.clear();
    this._bubbleGeometry?.dispose();
    this._bubbleGeometry = null;
    this._config = null;
    super.preDestroy();
  }
}
