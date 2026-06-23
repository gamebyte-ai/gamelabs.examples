import * as THREE from "three";
import gsap from "gsap";
import { WorldViewBase, World, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Physics3DEntityView } from "@gamebyte/gamelabsjs/physics3d";
import type { IPileView } from "./IPileView.js";
import { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import type { CollectResult } from "../utilities/FactoryOperations.js";
import type { Kind } from "../models/IGameModel.js";

const PICK_RANGE = 40;

interface SlotMesh {
  kind: Kind;
  obj: THREE.Object3D;
}

/**
 * World (3D) view: renders the bin (tall colliders are owned by operations; the
 * glass walls here are visual only), the physics-driven pile, and a 3D slot rack
 * that collected shapes fly into (GSAP-animated, with slide-on-reorder and a
 * rise + collapse on match). Reports clicks as a world-space ray for the physics raycast.
 */
export class PileView extends WorldViewBase implements IPileView {
  private _config: FactoryMatchConfig | null = null;
  private _world: World | null = null;
  private _prevFog: THREE.Scene["fog"] = null;
  /** Orthographic (isometric) camera; created + made active when config opts in. */
  private _ortho: THREE.OrthographicCamera | null = null;
  private readonly _bin = new THREE.Group();
  private readonly _rack = new THREE.Group();

  private readonly _ray = new THREE.Raycaster();
  private readonly _pickListeners = new Set<
    (ox: number, oy: number, oz: number, fx: number, fy: number, fz: number) => void
  >();
  private _pointerTarget: HTMLElement | null = null;

  /** Pile shapes eligible for hover/press selection (raycast targets). */
  private readonly _pileObjects = new Set<THREE.Object3D>();
  /** Currently outlined pile shape, if any. */
  private _hovered: THREE.Object3D | null = null;
  /** Live outline hull meshes (children of the hovered shape's meshes). */
  private readonly _outlineParts: THREE.Mesh[] = [];
  /** True while a non-mouse pointer is held down (touch/pen). */
  private _pressActive = false;

  /** Slotted (collected) shapes by item id, plus their display order. */
  private readonly _slots = new Map<number, SlotMesh>();
  private _order: number[] = [];
  /** Rack pads by slot index, plus their shared rest height (for the landing dip). */
  private readonly _pads: THREE.Mesh[] = [];
  private _padRestY = 0;
  /** Pending post-match delayed callbacks, killed on reset so a stale one can't pop a fresh item. */
  private readonly _pending = new Set<gsap.core.Tween>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(FactoryMatchConfig);
    this._world = resolver.getInstance(World);
  }

  public override postInitialize(): void {
    super.postInitialize();

    if (this._world) {
      this._prevFog = this._world.scene.fog ?? null;
      this._world.scene.fog = null;
    }
    this._setupCamera();

    this._buildBinVisual();
    this._buildRackVisual();
    this.add(this._bin, this._rack);

    const canvas = this._world?.renderer.domElement;
    this._pointerTarget = canvas?.parentElement ?? canvas ?? null;
    this._pointerTarget?.addEventListener("pointerdown", this._onPointerDown);
    this._pointerTarget?.addEventListener("pointermove", this._onPointerMove);
    this._pointerTarget?.addEventListener("pointerup", this._onPointerUp);
    this._pointerTarget?.addEventListener("pointercancel", this._onPointerUp);
    this._pointerTarget?.addEventListener("pointerleave", this._onPointerLeave);
  }

  //  CAMERA

  /** Position the active camera. With `orthographic`, build + activate an ortho
   * camera (isometric parallel projection); otherwise drive the perspective one. */
  private _setupCamera(): void {
    const cfg = this._config!;
    const world = this._world;
    if (!world) return;
    const { position: p, lookAt: l } = cfg.camera;

    if (cfg.camera.orthographic) {
      // Frustum is sized per-aspect in onResize; placeholder bounds for now.
      this._ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      this._ortho.position.set(p.x, p.y, p.z);
      this._ortho.lookAt(l.x, l.y, l.z);
      world.setActiveCamera(this._ortho);
      return;
    }

    const cam = world.camera;
    cam.position.set(p.x, p.y, p.z);
    cam.lookAt(l.x, l.y, l.z);
  }

  /** Keep the ortho frustum matched to the viewport: vertical extent is fixed by
   * `frustumHeight`, horizontal follows the aspect (portrait framing stays put). */
  public override onResize(width: number, height: number, _dpr: number): void {
    super.onResize(width, height, _dpr);
    const ortho = this._ortho;
    if (!ortho || width === 0 || height === 0) return;
    const h = this._config!.camera.frustumHeight;
    const w = h * (width / height);
    ortho.left = -w / 2;
    ortho.right = w / 2;
    ortho.top = h / 2;
    ortho.bottom = -h / 2;
    ortho.updateProjectionMatrix();
  }

  //  PILE ENTITY — stage drives the returned adapter

  public createEntity(kind: Kind): Physics3DEntityView {
    const obj = this._makeShape(kind);
    this.add(obj);
    this._pileObjects.add(obj);
    return {
      setTransform(t): void {
        obj.position.set(t.x, t.y, t.z);
        obj.quaternion.set(t.qx, t.qy, t.qz, t.qw);
      },
      dispose: (): void => {
        if (this._hovered === obj) this._setHover(null);
        this._pileObjects.delete(obj);
        PileView._disposeObject(obj);
      },
    };
  }

  //  SLOT RACK — collected shapes fly here and line up

  public applyCollect(result: CollectResult): void {
    // Spawn the collected shape at the pile pose + full size; it shrinks to
    // `itemScale` (a quarter) as it flies to the slot (animated in _layout).
    const obj = this._makeShape(result.kind);
    obj.position.set(result.from.x, result.from.y, result.from.z);
    this.add(obj);
    this._slots.set(result.addedId, { kind: result.kind, obj });
    // Insert just to the right of the rightmost same-kind item (so each kind
    // stays contiguous); if there's no match yet, append to the end. Everything
    // to the right shifts one slot over, handled by _layout re-indexing.
    let insertIndex = this._order.length;
    for (let i = this._order.length - 1; i >= 0; i--) {
      if (this._slots.get(this._order[i])?.kind === result.kind) {
        insertIndex = i + 1;
        break;
      }
    }
    this._order.splice(insertIndex, 0, result.addedId);
    this._layout(result.addedId);

    if (result.clearedIds.length > 0) {
      const cleared = new Set(result.clearedIds);
      // Let the flown shape land, then pop the trio and slide survivors closed.
      // Tracked + killed by clearSlots so a restart within the delay can't pop a
      // freshly collected item that reused a cleared id.
      const call = gsap.delayedCall(this._landTime(), () => {
        this._pending.delete(call);
        this._collapseMatch(result.clearedIds);
        this._order = this._order.filter((id) => !cleared.has(id));
        this._layout(null);
      });
      this._pending.add(call);
    }
  }

  public clearSlots(): void {
    for (const call of this._pending) call.kill();
    this._pending.clear();
    for (const { obj } of this._slots.values()) {
      gsap.killTweensOf(obj.position);
      gsap.killTweensOf(obj.scale);
      gsap.killTweensOf(obj.rotation);
      PileView._disposeObject(obj);
    }
    this._slots.clear();
    this._order = [];
    // Restore any pad caught mid-suspension so the rack reads flat on restart.
    for (const pad of this._pads) {
      gsap.killTweensOf(pad.position);
      pad.position.y = this._padRestY;
    }
  }

  /** Group by kind (stable), then animate every slotted shape to its rack position. */
  private _layout(flownId: number | null): void {
    const cfg = this._config!;
    this._order.forEach((id, index) => {
      const slot = this._slots.get(id);
      if (!slot) return;
      const target = this._slotPosition(index);
      const seatY = target.y + cfg.rack.itemLift;
      const isFlown = id === flownId;
      if (isFlown) {
        // Hop: glide x/z straight to the slot while y arcs up to a peak then drops
        // in, so the item lifts off the pile before flying rather than sliding flat.
        const peakY = Math.max(slot.obj.position.y, seatY) + cfg.rack.arcLift;
        const dip = cfg.rack.suspensionDip;
        const drop = Math.max(cfg.anim.trayDrop, 0); // tray fall — and rise-back — duration
        const landTime = this._landTime(); // ≥ fly; stretched if the tray needs longer
        gsap.killTweensOf(slot.obj.position);
        gsap.to(slot.obj.position, { x: target.x, z: target.z, duration: landTime, ease: "power2.inOut" });
        gsap.to(slot.obj.position, {
          keyframes: [
            { y: peakY, duration: landTime * 0.4, ease: "power2.out" }, // rise to peak
            { y: seatY - dip, duration: landTime * 0.6, ease: "power2.in" }, // descend straight to the lowest point (arrives at landTime)
            { y: seatY, duration: drop, ease: "back.out(2.5)" }, // rise back to rest with the tray (same duration as the fall)
          ],
        });
        // Tray meets the block at the bottom: it leaves later but arrives at the same instant.
        this._suspend(index, drop, landTime);
        gsap.to(slot.obj.rotation, {
          x: THREE.MathUtils.degToRad(cfg.rack.tiltX),
          y: THREE.MathUtils.degToRad(cfg.rack.itemRotationY),
          z: 0,
          duration: cfg.anim.fly,
          overwrite: true,
        });
        gsap.to(slot.obj.scale, {
          x: cfg.rack.itemScale,
          y: cfg.rack.itemScale,
          z: cfg.rack.itemScale,
          duration: cfg.anim.fly,
          ease: "power2.out",
          overwrite: true,
        });
      } else {
        // Seated neighbours that actually change slot hop across to it; ones
        // already in place are left untouched so they don't bounce for nothing.
        const moved =
          Math.abs(slot.obj.position.x - target.x) > 1e-3 || Math.abs(slot.obj.position.z - target.z) > 1e-3;
        if (!moved) return;
        const dip = cfg.rack.suspensionDip;
        const drop = Math.max(cfg.anim.trayDrop, 0);
        const hopTime = Math.max(cfg.anim.slide, drop); // stretched if the tray needs longer to give way
        const peakY = seatY + cfg.rack.shiftHop;
        gsap.killTweensOf(slot.obj.position);
        gsap.to(slot.obj.position, { x: target.x, z: target.z, duration: hopTime, ease: "power2.inOut" });
        gsap.to(slot.obj.position, {
          keyframes: [
            { y: peakY, duration: hopTime * 0.4, ease: "power2.out" }, // hop up
            { y: seatY - dip, duration: hopTime * 0.6, ease: "power2.in" }, // come down onto the new slot
            { y: seatY, duration: drop, ease: "back.out(2.5)" }, // settle back up with the tray
          ],
        });
        // The destination pad gives way as the hopping item lands on it.
        this._suspend(index, drop, hopTime);
      }
    });
  }

  /** Match clear: the trio rises off the rack and grows, then converges on the
   * group centre (the "median" point) while shrinking to nothing — a deliberate
   * merge rather than a flat pop. */
  private _collapseMatch(ids: readonly number[]): void {
    const cfg = this._config!;
    const objs: THREE.Object3D[] = [];
    for (const id of ids) {
      const slot = this._slots.get(id);
      if (!slot) continue;
      this._slots.delete(id);
      objs.push(slot.obj);
    }
    if (objs.length === 0) return;

    // Centre the shapes collapse toward: the centroid of their seated positions.
    const center = { x: 0, z: 0 };
    for (const obj of objs) {
      center.x += obj.position.x;
      center.z += obj.position.z;
    }
    center.x /= objs.length;
    center.z /= objs.length;

    const peakScale = cfg.rack.itemScale * cfg.rack.matchGrow;
    for (const obj of objs) {
      const riseY = obj.position.y + cfg.rack.matchLift;
      gsap.killTweensOf(obj.position);
      gsap.killTweensOf(obj.scale);
      // Phase 1 — rise off the rack while growing.
      gsap.to(obj.position, { y: riseY, duration: cfg.anim.matchRise, ease: "power2.out", overwrite: true });
      gsap.to(obj.scale, {
        x: peakScale,
        y: peakScale,
        z: peakScale,
        duration: cfg.anim.matchRise,
        ease: "back.out(2)",
        overwrite: true,
      });
      // Phase 2 — collapse toward the group centre, shrinking to zero.
      gsap.to(obj.position, {
        x: center.x,
        z: center.z,
        delay: cfg.anim.matchRise,
        duration: cfg.anim.matchCollapse,
        ease: "power2.in",
      });
      gsap.to(obj.scale, {
        x: 0,
        y: 0,
        z: 0,
        delay: cfg.anim.matchRise,
        duration: cfg.anim.matchCollapse,
        ease: "back.in(2)",
        onComplete: () => PileView._disposeObject(obj),
      });
    }
  }

  /** Total flight time of a collected block: at least `fly`, but stretched when
   * the tray needs longer than that to fall, so both always reach the bottom
   * together regardless of `trayDrop`. */
  private _landTime(): number {
    const cfg = this._config!;
    return Math.max(cfg.anim.fly, Math.max(cfg.anim.trayDrop, 0));
  }

  /** Suspension: the tray leaves its rest height `drop` seconds before the block
   * lands and falls to the lowest point over exactly `drop` seconds, reaching it
   * at the same instant the block does (`landTime`) — then both rise back to rest
   * over the same `drop` duration. Fall and rise are symmetric, both tracking
   * `trayDrop`. */
  private _suspend(index: number, drop: number, landTime: number): void {
    const pad = this._pads[index];
    if (!pad) return;
    const dip = this._config!.rack.suspensionDip;
    const delay = Math.max(0, landTime - drop);
    gsap.killTweensOf(pad.position);
    gsap.to(pad.position, {
      keyframes: [
        { y: this._padRestY - dip, duration: drop, ease: "power2.in" }, // fall to meet the block at the bottom
        { y: this._padRestY, duration: drop, ease: "back.out(2.5)" }, // rise back to rest together (same duration)
      ],
      delay,
    });
  }

  private _slotPosition(index: number): { x: number; y: number; z: number } {
    const cfg = this._config!;
    const cap = cfg.slots.capacity;
    return {
      x: (index - (cap - 1) / 2) * cfg.rack.spacing,
      y: cfg.rack.y,
      z: cfg.rack.z,
    };
  }

  //  INPUT

  public onPick(
    cb: (ox: number, oy: number, oz: number, fx: number, fy: number, fz: number) => void,
  ): Unsubscribe {
    this._pickListeners.add(cb);
    return () => this._pickListeners.delete(cb);
  }

  private readonly _onPointerDown = (event: PointerEvent): void => {
    const camera = this._world?.activeCamera;
    const ndc = this._ndcFromEvent(event);
    if (!camera || !ndc) return;
    this._ray.setFromCamera(ndc, camera);
    const o = this._ray.ray.origin;
    const d = this._ray.ray.direction;
    for (const cb of this._pickListeners) {
      cb(o.x, o.y, o.z, o.x + d.x * PICK_RANGE, o.y + d.y * PICK_RANGE, o.z + d.z * PICK_RANGE);
    }
    // Touch/pen: outline the pressed shape for as long as the finger is held.
    if (event.pointerType !== "mouse") {
      this._pressActive = true;
      this._setHover(this._pickPileObject(event));
    }
  };

  /** Mouse: outline whatever shape is under the cursor. Touch: track the held finger. */
  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") {
      this._setHover(this._pickPileObject(event));
    } else if (this._pressActive) {
      this._setHover(this._pickPileObject(event));
    }
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") {
      this._pressActive = false;
      this._setHover(null);
    }
  };

  private readonly _onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") this._setHover(null);
  };

  /** Pointer position → normalized device coords, or null if the canvas has no size. */
  private _ndcFromEvent(event: PointerEvent): THREE.Vector2 | null {
    const canvas = this._world?.renderer.domElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }

  /** Raycast against the pile shapes; returns the hit root shape (not a child mesh) or null. */
  private _pickPileObject(event: PointerEvent): THREE.Object3D | null {
    const camera = this._world?.activeCamera;
    const ndc = this._ndcFromEvent(event);
    if (!camera || !ndc || this._pileObjects.size === 0) return null;
    this._ray.setFromCamera(ndc, camera);
    const hits = this._ray.intersectObjects([...this._pileObjects], true);
    for (const hit of hits) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        if (this._pileObjects.has(o)) return o;
      }
    }
    return null;
  }

  /** Swap the outlined shape (no-op if unchanged). Pass null to clear. */
  private _setHover(obj: THREE.Object3D | null): void {
    if (obj === this._hovered) return;
    this._clearOutline();
    this._hovered = obj;
    if (obj) this._applyOutline(obj);
  }

  /**
   * Inverted-hull silhouette: a slightly enlarged back-faces-only copy of each
   * mesh. The shape's own front faces (drawn first, default renderOrder 0) cover
   * the hull's centre via the depth buffer, leaving only the outer rim — i.e. the
   * 2D screen contour, with no internal/back edges. Geometry is shared with the
   * source mesh, so it is NOT disposed on clear.
   */
  private _applyOutline(obj: THREE.Object3D): void {
    const cfg = this._config!;
    // Collect first: adding hull children during traverse() would make traverse
    // recurse into the freshly added hull (itself a Mesh) → infinite recursion.
    const meshes: THREE.Mesh[] = [];
    obj.traverse((node) => {
      if (node instanceof THREE.Mesh) meshes.push(node);
    });
    for (const node of meshes) {
      const hull = new THREE.Mesh(
        node.geometry,
        new THREE.MeshBasicMaterial({ color: cfg.outline.color, side: THREE.BackSide, depthWrite: false }),
      );
      hull.scale.setScalar(cfg.outline.scale);
      hull.renderOrder = 1; // after the shape so only the rim survives the depth test
      hull.raycast = (): void => {}; // never picked itself
      node.add(hull);
      this._outlineParts.push(hull);
    }
  }

  /** Remove + dispose all live outline hulls (geometry is shared — material only). */
  private _clearOutline(): void {
    for (const hull of this._outlineParts) {
      hull.removeFromParent();
      (hull.material as THREE.Material).dispose();
    }
    this._outlineParts.length = 0;
  }

  //  MESHES

  private _makeShape(kind: Kind): THREE.Object3D {
    const color = this._config!.kinds[kind].color;
    switch (kind) {
      case "cube":
        return this._mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), color);
      case "cylinder":
        return this._mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.5, 24), color);
      case "triprism": {
        const m = this._mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 3), color);
        m.rotation.y = Math.PI / 2;
        return m;
      }
      case "plus": {
        const group = new THREE.Group();
        group.add(this._mesh(new THREE.BoxGeometry(0.62, 0.5, 0.22), color));
        group.add(this._mesh(new THREE.BoxGeometry(0.22, 0.5, 0.62), color));
        return group;
      }
    }
  }

  private _mesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.12 }));
  }

  /** Visible slot pads so the rack reads even when empty. */
  private _buildRackVisual(): void {
    const cfg = this._config!;
    this._padRestY = cfg.rack.y - 0.0925; // top sits just under a quarter-scale shape
    for (let i = 0; i < cfg.slots.capacity; i++) {
      const pos = this._slotPosition(i);
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.rack.padWidth, 0.06, cfg.rack.padDepth),
        new THREE.MeshStandardMaterial({ color: cfg.rack.padColor, roughness: 0.85, metalness: 0.05 }),
      );
      pad.position.set(pos.x, this._padRestY, pos.z);
      pad.rotation.x = THREE.MathUtils.degToRad(cfg.rack.tiltX);
      this._rack.add(pad);
      this._pads.push(pad);
    }
  }

  private _buildBinVisual(): void {
    const { bin } = this._config!;
    const t = bin.wallThickness;
    const span = bin.innerHalf * 2 + t * 2;
    const edge = bin.innerHalf + t / 2;
    const wy = bin.floorY + bin.wallHeight / 2;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.2, span),
      new THREE.MeshStandardMaterial({ color: bin.floorColor, roughness: 0.85, metalness: 0.05 }),
    );
    floor.position.set(0, bin.floorY - 0.1, 0);
    this._bin.add(floor);

    const glass = (): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color: bin.wallColor, transparent: true, opacity: 0.22, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(t, bin.wallHeight, span), glass());
      w.position.set(sx * edge, wy, 0);
      this._bin.add(w);
    }
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(bin.innerHalf * 2, bin.wallHeight, t), glass());
      w.position.set(0, wy, sz * edge);
      this._bin.add(w);
    }
  }

  private static _disposeObject(obj: THREE.Object3D): void {
    obj.removeFromParent();
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  public override preDestroy(): void {
    this._pointerTarget?.removeEventListener("pointerdown", this._onPointerDown);
    this._pointerTarget?.removeEventListener("pointermove", this._onPointerMove);
    this._pointerTarget?.removeEventListener("pointerup", this._onPointerUp);
    this._pointerTarget?.removeEventListener("pointercancel", this._onPointerUp);
    this._pointerTarget?.removeEventListener("pointerleave", this._onPointerLeave);
    this._pointerTarget = null;
    this._pickListeners.clear();
    this._clearOutline();
    this._hovered = null;
    this._pileObjects.clear();
    this.clearSlots();
    PileView._disposeObject(this._bin);
    PileView._disposeObject(this._rack);
    if (this._world) {
      this._world.scene.fog = this._prevFog;
      if (this._ortho) this._world.setActiveCamera(this._world.camera); // restore perspective
    }
    this._ortho = null;
    super.preDestroy();
  }
}
