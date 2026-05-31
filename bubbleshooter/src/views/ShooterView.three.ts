import * as THREE from "three";
import { WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IShooterView } from "./IShooterView";
import { PlayAreaClipping } from "./PlayAreaClipping";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { BubbleGridLayout } from "../utilities/BubbleGridLayout";
import { ALL_BUBBLE_COLORS, BUBBLE_COLOR_HEX, BUBBLE_COLORS, type BubbleColor } from "../constants/BubbleColor";
import { BUBBLE_COLOR_TO_ASSET_ID, BubbleShooterAssetIds } from "../BubbleShooterAssetIds";

const BUBBLE_DISC_SEGMENTS = 48;
const SHOOTER_RING_SEGMENTS = 48;
const BUBBLE_VISUAL_RADIUS_FACTOR = 0.94;
const SHOOTER_Z = 0.2;

interface IShooterSwapAnim {
  age: number;
  readonly duration: number;
  readonly newHeldColor: BubbleColor;
  readonly newNextColor: BubbleColor;
  readonly heldFromX: number;
  readonly heldFromY: number;
  readonly heldToX: number;
  readonly heldToY: number;
  readonly heldFromScale: number;
  readonly heldToScale: number;
  readonly nextFromX: number;
  readonly nextFromY: number;
  readonly nextToX: number;
  readonly nextToY: number;
  readonly nextFromScale: number;
  readonly nextToScale: number;
}

/**
 * Shooter rig — turret group (ring + rotating barrel) plus the held
 * bubble + next-slot preview + held-slot power-ups. Builds its own
 * bubble geometry / materials so it doesn't depend on any other
 * sub-view's internal state. The swap animation lerps the held +
 * next meshes past each other; materials swap atomically when the
 * animation finishes.
 */
export class ShooterView extends WorldViewBase implements IShooterView {
  private _config: BubbleShooterConfig | null = null;
  private _layout: BubbleGridLayout | null = null;
  private _clipping: PlayAreaClipping | null = null;

  private _bubbleGeometry: THREE.CircleGeometry | null = null;
  private readonly _bubbleMaterials = new Map<BubbleColor, THREE.MeshBasicMaterial>();

  private _shooterGroup: THREE.Group | null = null;
  private _shooterRingMesh: THREE.Mesh | null = null;
  private _shooterBarrelMesh: THREE.Mesh | null = null;
  private _shooterBubbleMesh: THREE.Mesh | null = null;

  private _nextSlotIconMesh: THREE.Mesh | null = null;
  private _nextBubbleMesh: THREE.Mesh | null = null;

  private _bombMaterial: THREE.MeshBasicMaterial | null = null;
  private _shooterBombMesh: THREE.Mesh | null = null;

  private _fireballMaterial: THREE.MeshBasicMaterial | null = null;
  private _shooterFireballMesh: THREE.Mesh | null = null;

  private _shooterSwapAnim: IShooterSwapAnim | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._layout = resolver.getInstance(BubbleGridLayout);
    this._clipping = resolver.getInstance(PlayAreaClipping);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config;
    const layout = this._layout;
    if (!config || !layout) return;
    this._buildBubbleResources(config.bubbleRadius);
    this._buildShooter(config, layout);
    this._buildNextSlot(config, layout);
    this._buildBombResources(layout);
    this._buildFireballResources(layout);
  }

  public setShooterHeldColor(color: BubbleColor | null): void {
    if (!this._shooterBubbleMesh) return;
    if (color === null) {
      this._shooterBubbleMesh.visible = false;
      return;
    }
    const material = this._bubbleMaterials.get(color);
    if (material) {
      this._shooterBubbleMesh.material = material;
      this._shooterBubbleMesh.visible = true;
    }
  }

  public setShooterNextColor(color: BubbleColor | null): void {
    const mesh = this._nextBubbleMesh;
    if (!mesh) return;
    if (color === null) {
      mesh.visible = false;
      return;
    }
    const material = this._bubbleMaterials.get(color);
    if (!material) return;
    mesh.material = material;
    mesh.visible = true;
  }

  public setShooterIsBomb(active: boolean): void {
    if (!this._shooterBombMesh) return;
    this._shooterBombMesh.visible = active;
    if (active && this._shooterBubbleMesh) this._shooterBubbleMesh.visible = false;
  }

  public setShooterIsFireball(active: boolean): void {
    if (!this._shooterFireballMesh) return;
    this._shooterFireballMesh.visible = active;
    if (active && this._shooterBubbleMesh) this._shooterBubbleMesh.visible = false;
  }

  public setShooterAimAngle(angle: number): void {
    if (!this._shooterGroup) return;
    // Group's local +y is "forward". Aim angle is measured from world +x,
    // so π/2 means straight up — i.e. zero rotation.
    this._shooterGroup.rotation.z = angle - Math.PI / 2;
  }

  public playShooterSwap(newHeld: BubbleColor, newNext: BubbleColor): void {
    const config = this._config;
    const layout = this._layout;
    if (!config || !layout || !this._shooterBubbleMesh || !this._nextBubbleMesh) return;
    if (this._shooterSwapAnim) this._finalizeShooterSwap();

    const heldX = layout.shooterX;
    const heldY = layout.shooterY;
    const nextX = layout.nextSlotX;
    const nextY = layout.nextSlotY;
    const heldScale = 1;
    const nextScale = config.nextBubbleRadiusScale;

    this._shooterSwapAnim = {
      age: 0,
      duration: config.shooterSwapDurationSeconds,
      newHeldColor: newHeld,
      newNextColor: newNext,
      heldFromX: heldX,
      heldFromY: heldY,
      heldToX: nextX,
      heldToY: nextY,
      heldFromScale: heldScale,
      heldToScale: nextScale,
      nextFromX: nextX,
      nextFromY: nextY,
      nextToX: heldX,
      nextToY: heldY,
      nextFromScale: nextScale,
      nextToScale: heldScale,
    };
  }

  public updateShooterAnim(dt: number): void {
    const a = this._shooterSwapAnim;
    if (!a) return;
    a.age += dt;
    const t = Math.min(1, a.age / a.duration);
    const heldMesh = this._shooterBubbleMesh;
    const nextMesh = this._nextBubbleMesh;
    if (heldMesh) {
      heldMesh.position.x = a.heldFromX + (a.heldToX - a.heldFromX) * t;
      heldMesh.position.y = a.heldFromY + (a.heldToY - a.heldFromY) * t;
      heldMesh.scale.setScalar(a.heldFromScale + (a.heldToScale - a.heldFromScale) * t);
    }
    if (nextMesh) {
      nextMesh.position.x = a.nextFromX + (a.nextToX - a.nextFromX) * t;
      nextMesh.position.y = a.nextFromY + (a.nextToY - a.nextFromY) * t;
      nextMesh.scale.setScalar(a.nextFromScale + (a.nextToScale - a.nextFromScale) * t);
    }
    if (t >= 1) this._finalizeShooterSwap();
  }

  /**
   * End-of-animation reset: snap meshes back to their slot positions
   * + scales and apply the post-swap materials. Visually invisible
   * because the materials at the swapped positions match what the
   * meshes were already showing one frame earlier.
   */
  private _finalizeShooterSwap(): void {
    const a = this._shooterSwapAnim;
    if (!a) return;
    const heldMesh = this._shooterBubbleMesh;
    const nextMesh = this._nextBubbleMesh;
    if (heldMesh) {
      heldMesh.position.set(a.heldFromX, a.heldFromY, SHOOTER_Z);
      heldMesh.scale.setScalar(a.heldFromScale);
      const mat = this._bubbleMaterials.get(a.newHeldColor);
      if (mat) heldMesh.material = mat;
    }
    if (nextMesh) {
      nextMesh.position.set(a.nextFromX, a.nextFromY, SHOOTER_Z);
      nextMesh.scale.setScalar(a.nextFromScale);
      const mat = this._bubbleMaterials.get(a.newNextColor);
      if (mat) nextMesh.material = mat;
    }
    this._shooterSwapAnim = null;
  }

  private _buildBubbleResources(bubbleRadius: number): void {
    this._bubbleGeometry = new THREE.CircleGeometry(bubbleRadius * BUBBLE_VISUAL_RADIUS_FACTOR, BUBBLE_DISC_SEGMENTS);
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

  private _buildShooter(config: BubbleShooterConfig, layout: BubbleGridLayout): void {
    const group = new THREE.Group();
    group.position.set(layout.shooterX, layout.shooterY, SHOOTER_Z);
    this._shooterGroup = group;
    this.add(group);

    const ringInner = config.shooterRadius - config.shooterRingThickness;
    const ringGeo = new THREE.RingGeometry(ringInner, config.shooterRadius, SHOOTER_RING_SEGMENTS);
    const ringMat = new THREE.MeshBasicMaterial({ color: config.shooterRingColor, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    this._shooterRingMesh = ring;
    group.add(ring);

    const barrelGeo = new THREE.PlaneGeometry(config.shooterBarrelThickness, config.shooterBarrelLength);
    const barrelMat = new THREE.MeshBasicMaterial({ color: config.shooterBarrelColor });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, config.shooterRadius * 0.5 + config.shooterBarrelLength * 0.4, 0);
    this._shooterBarrelMesh = barrel;
    group.add(barrel);

    // Held bubble: attached *outside* the rotating group so the procedural
    // highlight stays in the upper-left regardless of aim.
    const placeholder = this._bubbleMaterials.get(BUBBLE_COLORS[0]!);
    const bubbleGeo = this._bubbleGeometry;
    if (bubbleGeo && placeholder) {
      const bubble = new THREE.Mesh(bubbleGeo, placeholder);
      bubble.position.set(layout.shooterX, layout.shooterY, SHOOTER_Z);
      this._shooterBubbleMesh = bubble;
      this.add(bubble);
    }
  }

  private _buildNextSlot(config: BubbleShooterConfig, layout: BubbleGridLayout): void {
    const iconTex = this.assetLoader.getAsset<THREE.Texture>(BubbleShooterAssetIds.SwapIcon);
    const iconGeo = new THREE.PlaneGeometry(config.nextSlotIconSize, config.nextSlotIconSize);
    const iconMat = iconTex
      ? new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0x6b86a8, transparent: true, opacity: 0.6, depthWrite: false });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    icon.position.set(layout.nextSlotX, layout.nextSlotY, SHOOTER_Z - 0.05);
    this._nextSlotIconMesh = icon;
    this.add(icon);

    if (!this._bubbleGeometry) return;
    const placeholder = this._bubbleMaterials.get(BUBBLE_COLORS[0]!);
    if (!placeholder) return;
    const bubble = new THREE.Mesh(this._bubbleGeometry, placeholder);
    bubble.scale.setScalar(config.nextBubbleRadiusScale);
    bubble.position.set(layout.nextSlotX, layout.nextSlotY, SHOOTER_Z);
    bubble.visible = false;
    this._nextBubbleMesh = bubble;
    this.add(bubble);
  }

  private _buildBombResources(layout: BubbleGridLayout): void {
    if (!this._bubbleGeometry) return;
    const clippingPlanes = this._clipping?.planes;
    const tex = this.assetLoader.getAsset<THREE.Texture>(BubbleShooterAssetIds.BombBubble);
    this._bombMaterial = tex
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, clippingPlanes })
      : new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, depthWrite: false, clippingPlanes });
    const heldBomb = new THREE.Mesh(this._bubbleGeometry, this._bombMaterial);
    heldBomb.position.set(layout.shooterX, layout.shooterY, SHOOTER_Z);
    heldBomb.visible = false;
    this._shooterBombMesh = heldBomb;
    this.add(heldBomb);
  }

  private _buildFireballResources(layout: BubbleGridLayout): void {
    if (!this._bubbleGeometry) return;
    const clippingPlanes = this._clipping?.planes;
    const tex = this.assetLoader.getAsset<THREE.Texture>(BubbleShooterAssetIds.FireballBubble);
    this._fireballMaterial = tex
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, clippingPlanes })
      : new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, depthWrite: false, clippingPlanes });
    const heldFireball = new THREE.Mesh(this._bubbleGeometry, this._fireballMaterial);
    heldFireball.position.set(layout.shooterX, layout.shooterY, SHOOTER_Z);
    heldFireball.visible = false;
    this._shooterFireballMesh = heldFireball;
    this.add(heldFireball);
  }

  public override preDestroy(): void {
    if (this._nextBubbleMesh) {
      this.remove(this._nextBubbleMesh);
      this._nextBubbleMesh = null;
    }
    if (this._nextSlotIconMesh) {
      this.remove(this._nextSlotIconMesh);
      this._nextSlotIconMesh.geometry.dispose();
      (this._nextSlotIconMesh.material as THREE.MeshBasicMaterial).dispose();
      this._nextSlotIconMesh = null;
    }
    if (this._shooterBombMesh) {
      this.remove(this._shooterBombMesh);
      this._shooterBombMesh = null;
    }
    if (this._bombMaterial) {
      this._bombMaterial.dispose();
      this._bombMaterial = null;
    }
    if (this._shooterFireballMesh) {
      this.remove(this._shooterFireballMesh);
      this._shooterFireballMesh = null;
    }
    if (this._fireballMaterial) {
      this._fireballMaterial.dispose();
      this._fireballMaterial = null;
    }
    if (this._shooterGroup) {
      this.remove(this._shooterGroup);
      this._shooterGroup = null;
    }
    if (this._shooterRingMesh) {
      this._shooterRingMesh.geometry.dispose();
      (this._shooterRingMesh.material as THREE.MeshBasicMaterial).dispose();
      this._shooterRingMesh = null;
    }
    if (this._shooterBarrelMesh) {
      this._shooterBarrelMesh.geometry.dispose();
      (this._shooterBarrelMesh.material as THREE.MeshBasicMaterial).dispose();
      this._shooterBarrelMesh = null;
    }
    if (this._shooterBubbleMesh) {
      this.remove(this._shooterBubbleMesh);
      this._shooterBubbleMesh = null;
    }
    this._shooterSwapAnim = null;
    for (const mat of this._bubbleMaterials.values()) mat.dispose();
    this._bubbleMaterials.clear();
    this._bubbleGeometry?.dispose();
    this._bubbleGeometry = null;
    this._config = null;
    this._layout = null;
    super.preDestroy();
  }
}
