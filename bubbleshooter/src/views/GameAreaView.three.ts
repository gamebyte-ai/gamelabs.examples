import * as THREE from "three";
import { WorldViewBase, World, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IGameAreaView } from "./IGameAreaView";
import { AimLineView } from "./AimLineView.three";
import { BubbleGridView } from "./BubbleGridView.three";
import { EffectsView } from "./EffectsView.three";
import { FallingBubblesView } from "./FallingBubblesView.three";
import { FlightView } from "./FlightView.three";
import { PowerUpCollectionView } from "./PowerUpCollectionView.three";
import { ShooterView } from "./ShooterView.three";
import { PlayAreaClipping } from "./PlayAreaClipping";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { BubbleGridLayout } from "../utilities/BubbleGridLayout";


/**
 * Parent of the world-side game area. Owns only the play-area chrome
 * (background, border, cell outlines), the world pointer-event host
 * (forwarded as `onAimAtWorld` / `onFire` / `onSwap`), and the
 * fog-suppression around its mounted lifetime. Visual concerns are
 * delegated to sub-views, each with its own controller subscribing
 * to the events it cares about — this view does not route events to
 * children.
 */
export class GameAreaView extends WorldViewBase implements IGameAreaView {
  private _config: BubbleShooterConfig | null = null;
  private _layout: BubbleGridLayout | null = null;
  private _world: World | null = null;
  private _clipping: PlayAreaClipping | null = null;
  private _previousSceneFog: THREE.Fog | THREE.FogExp2 | null = null;

  private _backgroundMesh: THREE.Mesh | null = null;
  private readonly _borderMeshes: THREE.Mesh[] = [];
  private _loseLineMesh: THREE.Mesh | null = null;

  private _bubbleGridView: BubbleGridView | null = null;
  private _shooterView: ShooterView | null = null;
  private _aimLineView: AimLineView | null = null;
  private _flightView: FlightView | null = null;
  private _fallingBubblesView: FallingBubblesView | null = null;
  private _effectsView: EffectsView | null = null;
  private _powerUpCollectionView: PowerUpCollectionView | null = null;

  private readonly _aimListeners = new Set<(worldX: number, worldY: number) => void>();
  private readonly _fireListeners = new Set<() => void>();
  private readonly _swapListeners = new Set<() => void>();
  private _canvasEl: HTMLCanvasElement | null = null;
  private _pointerEventTarget: HTMLElement | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._layout = resolver.getInstance(BubbleGridLayout);
    this._world = resolver.getInstance(World);
    this._clipping = resolver.getInstance(PlayAreaClipping);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config!;
    const layout = this._layout!;

    // World ships a small-scale fog (near 4, far 20) tuned for typical 3D
    // scenes. Our world units are pixel-sized and the camera focal point
    // is hundreds of units away, so the default fog would render the
    // entire grid as the background colour. Turn it off while we're
    // mounted; preDestroy restores whatever was there before.
    if (this._world) {
      this._previousSceneFog = this._world.scene.fog ?? null;
      this._world.scene.fog = null;
      // Per-material clipping is opt-in on the renderer. Bubble
      // sub-views set `clippingPlanes` on their materials; this
      // flag tells WebGLRenderer to honour them.
      this._world.renderer.localClippingEnabled = true;
    }

    this._buildPlayAreaChrome();

    // Sub-view composition. Each sub-view registers its own controller
    // via `viewFactory.register()` (in `BubbleShooterApp.configureViews`)
    // and subscribes to its own slice of `GameEvents` directly — the
    // parent does not route events to children.
    this._bubbleGridView = this.viewFactory.createView(BubbleGridView);
    this.add(this._bubbleGridView);
    this._shooterView = this.viewFactory.createView(ShooterView);
    this.add(this._shooterView);
    this._aimLineView = this.viewFactory.createView(AimLineView);
    this.add(this._aimLineView);
    this._flightView = this.viewFactory.createView(FlightView);
    this.add(this._flightView);
    this._fallingBubblesView = this.viewFactory.createView(FallingBubblesView);
    this.add(this._fallingBubblesView);
    this._effectsView = this.viewFactory.createView(EffectsView);
    this.add(this._effectsView);
    // Power-up collection icons render on top of the play area
    // chrome and are intentionally NOT clipped — they fly past the
    // border into HUD-button territory.
    this._powerUpCollectionView = this.viewFactory.createView(PowerUpCollectionView);
    this.add(this._powerUpCollectionView);

    this._attachPointerListener();
  }

  public onAimAtWorld(cb: (worldX: number, worldY: number) => void): Unsubscribe {
    this._aimListeners.add(cb);
    return () => this._aimListeners.delete(cb);
  }

  public onFire(cb: () => void): Unsubscribe {
    this._fireListeners.add(cb);
    return () => this._fireListeners.delete(cb);
  }

  public onSwap(cb: () => void): Unsubscribe {
    this._swapListeners.add(cb);
    return () => this._swapListeners.delete(cb);
  }

  /**
   * Rebuild the play-area chrome (background, border, cell outlines)
   * from the current layout dimensions. Called on layout change
   * (per-level width override) — disposes the old geometry first so
   * a wider grid doesn't leave a smaller background showing through.
   */
  public rebuildPlayArea(): void {
    this._disposePlayAreaChrome();
    this._buildPlayAreaChrome();
    // Bubble materials reference the same plane instances, so a
    // single in-place update propagates to every clipped material.
    if (this._clipping && this._layout) this._clipping.refreshFromLayout(this._layout);
  }

  private _buildPlayAreaChrome(): void {
    const config = this._config;
    const layout = this._layout;
    if (!config || !layout) return;
    this._buildBackground(layout.areaWidth, layout.areaHeight, config.playAreaBgColor);
    this._buildBorder(layout.areaWidth, layout.areaHeight, config.playAreaBorderWidth, config.playAreaBorderColor);
    this._buildLoseLine(layout, config);
  }

  private _buildLoseLine(layout: BubbleGridLayout, config: BubbleShooterConfig): void {
    const geo = new THREE.PlaneGeometry(layout.areaWidth, config.loseLineThickness);
    const mat = new THREE.MeshBasicMaterial({ color: config.loseLineColor, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, layout.loseLineY, 0);
    this._loseLineMesh = mesh;
    this.add(mesh);
  }

  private _disposePlayAreaChrome(): void {
    if (this._loseLineMesh) {
      this.remove(this._loseLineMesh);
      this._loseLineMesh.geometry.dispose();
      (this._loseLineMesh.material as THREE.MeshBasicMaterial).dispose();
      this._loseLineMesh = null;
    }
    for (const mesh of this._borderMeshes) {
      this.remove(mesh);
      mesh.geometry.dispose();
    }
    if (this._borderMeshes.length > 0) {
      (this._borderMeshes[0]!.material as THREE.MeshBasicMaterial).dispose();
    }
    this._borderMeshes.length = 0;
    if (this._backgroundMesh) {
      this.remove(this._backgroundMesh);
      this._backgroundMesh.geometry.dispose();
      (this._backgroundMesh.material as THREE.MeshBasicMaterial).dispose();
      this._backgroundMesh = null;
    }
  }

  private _buildBackground(width: number, height: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, -0.1);
    this._backgroundMesh = mesh;
    this.add(mesh);
  }

  private _buildBorder(width: number, height: number, thickness: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color });
    const halfW = width / 2;
    const halfH = height / 2;
    const t = thickness;
    const make = (w: number, h: number, x: number, y: number): void => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, -0.05);
      this._borderMeshes.push(mesh);
      this.add(mesh);
    };
    make(width + t * 2, t, 0, halfH + t / 2);
    make(width + t * 2, t, 0, -halfH - t / 2);
    make(t, height, -halfW - t / 2, 0);
    make(t, height, halfW + t / 2, 0);
  }


  private _attachPointerListener(): void {
    if (!this._world) return;
    this._canvasEl = this._world.renderer.domElement;
    // Pixi's HUD canvas is layered on top of the WebGL canvas, so pointer
    // events go to it — not to the WebGL canvas. Listen on the shared
    // mount/parent so we catch events bubbling from either canvas.
    this._pointerEventTarget = this._canvasEl.parentElement ?? this._canvasEl;
    this._pointerEventTarget.addEventListener("pointermove", this._onPointerMove);
    this._pointerEventTarget.addEventListener("pointerdown", this._onPointerDown);
    this._pointerEventTarget.addEventListener("contextmenu", this._onContextMenu);
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    const world = this._eventToWorld(event);
    if (!world) return;
    for (const cb of this._aimListeners) cb(world.x, world.y);
  };

  private readonly _onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      for (const cb of this._swapListeners) cb();
      return;
    }
    if (event.button !== 0) return;
    // Left-click on the next-slot icon also triggers swap.
    const world = this._eventToWorld(event);
    if (world && this._isOverNextSlot(world.x, world.y)) {
      for (const cb of this._swapListeners) cb();
      return;
    }
    for (const cb of this._fireListeners) cb();
  };

  private readonly _onContextMenu = (event: MouseEvent): void => {
    // Suppress the browser context menu so right-click can drive swap.
    event.preventDefault();
  };

  private _eventToWorld(event: MouseEvent): { x: number; y: number } | null {
    const world = this._world;
    if (!world || !this._canvasEl) return null;
    const camera = world.activeCamera;
    if (!camera) return null;
    const rect = this._canvasEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    const v = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
    return { x: v.x, y: v.y };
  }

  private _isOverNextSlot(worldX: number, worldY: number): boolean {
    const layout = this._layout;
    const config = this._config;
    if (!layout || !config) return false;
    const dx = worldX - layout.nextSlotX;
    const dy = worldY - layout.nextSlotY;
    const r = config.nextSlotClickRadius;
    return dx * dx + dy * dy <= r * r;
  }

  public override preDestroy(): void {
    if (this._pointerEventTarget) {
      this._pointerEventTarget.removeEventListener("pointermove", this._onPointerMove);
      this._pointerEventTarget.removeEventListener("pointerdown", this._onPointerDown);
      this._pointerEventTarget.removeEventListener("contextmenu", this._onContextMenu);
      this._pointerEventTarget = null;
    }
    this._canvasEl = null;
    this._aimListeners.clear();
    this._fireListeners.clear();
    this._swapListeners.clear();

    // Tear down sub-views before chrome so the scene graph empties
    // child-first (matches how they were added).
    if (this._powerUpCollectionView) {
      this.remove(this._powerUpCollectionView);
      this._powerUpCollectionView.preDestroy();
      this._powerUpCollectionView = null;
    }
    if (this._effectsView) {
      this.remove(this._effectsView);
      this._effectsView.preDestroy();
      this._effectsView = null;
    }
    if (this._fallingBubblesView) {
      this.remove(this._fallingBubblesView);
      this._fallingBubblesView.preDestroy();
      this._fallingBubblesView = null;
    }
    if (this._flightView) {
      this.remove(this._flightView);
      this._flightView.preDestroy();
      this._flightView = null;
    }
    if (this._aimLineView) {
      this.remove(this._aimLineView);
      this._aimLineView.preDestroy();
      this._aimLineView = null;
    }
    if (this._shooterView) {
      this.remove(this._shooterView);
      this._shooterView.preDestroy();
      this._shooterView = null;
    }
    if (this._bubbleGridView) {
      this.remove(this._bubbleGridView);
      this._bubbleGridView.preDestroy();
      this._bubbleGridView = null;
    }

    this._disposePlayAreaChrome();

    if (this._world) {
      this._world.scene.fog = this._previousSceneFog;
    }
    this._previousSceneFog = null;
    this._world = null;
    this._config = null;
    this._layout = null;
    super.preDestroy();
  }
}
