import * as THREE from "three";
import { WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IPowerUpCollectionView } from "./IPowerUpCollectionView";
import { PowerUpButtonTargets } from "./PowerUpButtonTargets";
import { PowerUpFlightTrack } from "./PowerUpFlightTrack";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { BubbleShooterAssetIds } from "../BubbleShooterAssetIds";
import type { PowerUpKind } from "../constants/PowerUpKind";

const ICON_VISUAL_RADIUS_FACTOR = 0.94;
const ICON_DISC_SEGMENTS = 32;
const ICON_Z = 0.7;

/**
 * Renders in-flight power-up collection icons. Each
 * {@link buildFlightTrack} call allocates a mesh, parents it to this
 * view, and returns a {@link PowerUpFlightTrack} that drives a cubic-
 * ease-in flight toward the matching HUD button's world position.
 * The icon is intentionally NOT clipped by the play-area planes so it
 * can fly past the border into HUD-button territory.
 *
 * Split of concerns:
 * - View (here): mesh allocation, scene-graph parenting, target lookup,
 *   track construction. Holds nothing that requires `TimelineManager`.
 * - Controller (`PowerUpCollectionViewController`): resolves
 *   `TimelineManager` (which is bound on the main DI container, not
 *   the view DI container), `add`s the built track on collection
 *   events, and calls `cancelByType` on level reload. Same view ↔
 *   controller split avoidance uses for `ParticleManager` registration.
 */
export class PowerUpCollectionView extends WorldViewBase implements IPowerUpCollectionView {
  private _config: BubbleShooterConfig | null = null;
  private _targets: PowerUpButtonTargets | null = null;

  private _geometry: THREE.CircleGeometry | null = null;
  private _bombMaterial: THREE.MeshBasicMaterial | null = null;
  private _fireballMaterial: THREE.MeshBasicMaterial | null = null;
  /** Live meshes pending track completion. Kept so `clearAll` can detach orphaned icons after a controller-level cancel. */
  private readonly _liveMeshes = new Set<THREE.Mesh>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._targets = resolver.getInstance(PowerUpButtonTargets);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config;
    if (!config) return;
    this._geometry = new THREE.CircleGeometry(config.bubbleRadius * ICON_VISUAL_RADIUS_FACTOR, ICON_DISC_SEGMENTS);
    this._bombMaterial = this._buildMaterial(BubbleShooterAssetIds.BombBubble);
    this._fireballMaterial = this._buildMaterial(BubbleShooterAssetIds.FireballBubble);
  }

  private _buildMaterial(assetId: string): THREE.MeshBasicMaterial {
    const tex = this.assetLoader.getAsset<THREE.Texture>(assetId);
    return new THREE.MeshBasicMaterial({
      map: tex ?? null,
      transparent: true,
      depthWrite: false,
    });
  }

  public buildFlightTrack(kind: PowerUpKind, fromX: number, fromY: number): PowerUpFlightTrack | null {
    const config = this._config;
    const targets = this._targets;
    const geometry = this._geometry;
    if (!config || !targets || !geometry) return null;
    const material = kind === "bomb" ? this._bombMaterial : this._fireballMaterial;
    if (!material) return null;
    const toX = kind === "bomb" ? targets.bombX : targets.fireballX;
    const toY = kind === "bomb" ? targets.bombY : targets.fireballY;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(fromX, fromY, ICON_Z);
    mesh.renderOrder = 14;
    this.add(mesh);
    this._liveMeshes.add(mesh);
    const onArrived = (): void => {
      if (!this._liveMeshes.has(mesh)) return;
      this._liveMeshes.delete(mesh);
      this.remove(mesh);
    };
    return new PowerUpFlightTrack(mesh, fromX, fromY, toX, toY, config.powerUpCollectDurationSeconds, onArrived);
  }

  public clearAll(): void {
    // The controller has already asked `TimelineManager.cancelByType`
    // for our track type; each track's `onCancel` invoked the
    // `onArrived` callback which detached its mesh and pruned the
    // set. This pass is a safety sweep for any edge case where a
    // mesh outlived its track.
    for (const mesh of this._liveMeshes) this.remove(mesh);
    this._liveMeshes.clear();
  }

  public override preDestroy(): void {
    this.clearAll();
    this._bombMaterial?.dispose();
    this._bombMaterial = null;
    this._fireballMaterial?.dispose();
    this._fireballMaterial = null;
    this._geometry?.dispose();
    this._geometry = null;
    this._config = null;
    this._targets = null;
    super.preDestroy();
  }
}
