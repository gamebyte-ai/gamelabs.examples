import * as THREE from "three";
import { WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IFlightView } from "./IFlightView";
import { PlayAreaClipping } from "./PlayAreaClipping";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { ALL_BUBBLE_COLORS, BUBBLE_COLOR_HEX, type BubbleColor } from "../constants/BubbleColor";
import { BUBBLE_COLOR_TO_ASSET_ID, BubbleShooterAssetIds } from "../BubbleShooterAssetIds";

const BUBBLE_DISC_SEGMENTS = 48;
const BUBBLE_VISUAL_RADIUS_FACTOR = 0.94;

/**
 * In-flight projectile layer. Owns three meshes — a coloured bubble,
 * a bomb, and a fireball — each created once at postInitialize and
 * toggled visible/invisible by ops events. Builds its own copy of the
 * bubble geometry + colour materials (textures are still shared via
 * AssetManager).
 */
export class FlightView extends WorldViewBase implements IFlightView {
  private _config: BubbleShooterConfig | null = null;
  private _clipping: PlayAreaClipping | null = null;
  private _bubbleGeometry: THREE.CircleGeometry | null = null;
  private readonly _bubbleMaterials = new Map<BubbleColor, THREE.MeshBasicMaterial>();
  private _bombMaterial: THREE.MeshBasicMaterial | null = null;
  private _fireballMaterial: THREE.MeshBasicMaterial | null = null;
  private _flyingBubbleMesh: THREE.Mesh | null = null;
  private _flyingBombMesh: THREE.Mesh | null = null;
  private _flyingFireballMesh: THREE.Mesh | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._clipping = resolver.getInstance(PlayAreaClipping);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config;
    if (!config) return;
    const clippingPlanes = this._clipping?.planes;
    this._bubbleGeometry = new THREE.CircleGeometry(
      config.bubbleRadius * BUBBLE_VISUAL_RADIUS_FACTOR,
      BUBBLE_DISC_SEGMENTS,
    );
    for (const color of ALL_BUBBLE_COLORS) {
      const tex = this.assetLoader.getAsset<THREE.Texture>(BUBBLE_COLOR_TO_ASSET_ID[color]);
      this._bubbleMaterials.set(
        color,
        tex
          ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, clippingPlanes })
          : new THREE.MeshBasicMaterial({ color: BUBBLE_COLOR_HEX[color], transparent: true, depthWrite: false, clippingPlanes }),
      );
    }

    const bombTex = this.assetLoader.getAsset<THREE.Texture>(BubbleShooterAssetIds.BombBubble);
    this._bombMaterial = bombTex
      ? new THREE.MeshBasicMaterial({ map: bombTex, transparent: true, depthWrite: false, clippingPlanes })
      : new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, depthWrite: false, clippingPlanes });
    const fireballTex = this.assetLoader.getAsset<THREE.Texture>(BubbleShooterAssetIds.FireballBubble);
    this._fireballMaterial = fireballTex
      ? new THREE.MeshBasicMaterial({ map: fireballTex, transparent: true, depthWrite: false, clippingPlanes })
      : new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, depthWrite: false, clippingPlanes });

    const bubbleStartMat = this._bubbleMaterials.values().next().value;
    if (bubbleStartMat) {
      const m = new THREE.Mesh(this._bubbleGeometry, bubbleStartMat);
      m.visible = false;
      this._flyingBubbleMesh = m;
      this.add(m);
    }
    const bombMesh = new THREE.Mesh(this._bubbleGeometry, this._bombMaterial);
    bombMesh.visible = false;
    this._flyingBombMesh = bombMesh;
    this.add(bombMesh);

    const fireballMesh = new THREE.Mesh(this._bubbleGeometry, this._fireballMaterial);
    fireballMesh.visible = false;
    this._flyingFireballMesh = fireballMesh;
    this.add(fireballMesh);
  }

  public setFlyingBubble(color: BubbleColor | null, x: number, y: number): void {
    const mesh = this._flyingBubbleMesh;
    if (!mesh) return;
    if (color === null) {
      mesh.visible = false;
      return;
    }
    const material = this._bubbleMaterials.get(color);
    if (!material) return;
    mesh.material = material;
    mesh.position.set(x, y, 0);
    mesh.visible = true;
  }

  public setFlyingBomb(active: boolean, x: number, y: number): void {
    const mesh = this._flyingBombMesh;
    if (!mesh) return;
    if (!active) {
      mesh.visible = false;
      return;
    }
    mesh.position.set(x, y, 0);
    mesh.visible = true;
  }

  public setFireball(active: boolean, x: number, y: number): void {
    const mesh = this._flyingFireballMesh;
    if (!mesh) return;
    if (!active) {
      mesh.visible = false;
      return;
    }
    mesh.position.set(x, y, 0);
    mesh.visible = true;
  }

  public override preDestroy(): void {
    if (this._flyingBubbleMesh) {
      this.remove(this._flyingBubbleMesh);
      this._flyingBubbleMesh = null;
    }
    if (this._flyingBombMesh) {
      this.remove(this._flyingBombMesh);
      this._flyingBombMesh = null;
    }
    if (this._flyingFireballMesh) {
      this.remove(this._flyingFireballMesh);
      this._flyingFireballMesh = null;
    }
    this._bombMaterial?.dispose();
    this._bombMaterial = null;
    this._fireballMaterial?.dispose();
    this._fireballMaterial = null;
    for (const mat of this._bubbleMaterials.values()) mat.dispose();
    this._bubbleMaterials.clear();
    this._bubbleGeometry?.dispose();
    this._bubbleGeometry = null;
    this._config = null;
    super.preDestroy();
  }
}
