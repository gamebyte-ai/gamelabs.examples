import * as THREE from "three";
import gsap from "gsap";
import { WorldViewBase, World, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { BodyId, Physics3DEntityView } from "@gamebyte/gamelabsjs/physics3d";
import type { IPileView } from "./IPileView.js";
import { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import { ModelLibraryService } from "../services/ModelLibraryService.js";
import { TrailRibbon } from "./TrailRibbon.three.js";
import type { CollectResult } from "../utilities/FactoryOperations.js";
import type { Kind } from "../models/IGameModel.js";

const PICK_RANGE = 40;
const OUTLINE_MASK_ORDER = 998; // stencil mask of the hovered shape's silhouette…
const OUTLINE_RIM_ORDER = 999; // …then the rim, drawn only outside it, over other items

interface SlotMesh {
  kind: Kind;
  obj: THREE.Object3D;
  /** Slot index this item was last animated toward; -1 until first laid out.
   * Re-layout skips items whose index is unchanged so in-flight tweens aren't
   * restarted (which would leave them hovering). */
  index: number;
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
  private _models: ModelLibraryService | null = null;
  private _prevFog: THREE.Scene["fog"] = null;
  private _prevBackground: THREE.Scene["background"] = null;
  /** Orthographic (isometric) camera; created + made active when config opts in. */
  private _ortho: THREE.OrthographicCamera | null = null;
  private readonly _bin = new THREE.Group();
  private readonly _rack = new THREE.Group();

  private readonly _ray = new THREE.Raycaster();
  private readonly _pickListeners = new Set<(bodyId: BodyId | null) => void>();
  /** Maps each pile shape to its physics body, so a visual pick resolves to a body. */
  private readonly _bodyByObject = new Map<THREE.Object3D, BodyId>();
  private _pointerTarget: HTMLElement | null = null;

  /** Pile shapes eligible for hover/press selection (raycast targets). */
  private readonly _pileObjects = new Set<THREE.Object3D>();
  /** Currently outlined pile shape, if any. */
  private _hovered: THREE.Object3D | null = null;
  /** Live outline hull meshes (children of the hovered shape's meshes). */
  private readonly _outlineParts: THREE.Mesh[] = [];
  /** True while a non-mouse pointer is held down (touch/pen). */
  private _pressActive = false;
  /** Gates the hover/press outline — off until play starts, off again at game over. */
  private _interactive = false;

  /** Slotted (collected) shapes by item id, plus their display order. */
  private readonly _slots = new Map<number, SlotMesh>();
  private _order: number[] = [];
  /** Rack pads by slot index, plus their shared rest height (for the landing dip). */
  private readonly _pads: THREE.Mesh[] = [];
  private _padRestY = 0;
  /** Pending post-match delayed callbacks, killed on reset so a stale one can't pop a fresh item. */
  private readonly _pending = new Set<gsap.core.Tween>();
  /** Live comet-trail ribbons + the per-fly tweens that drive them. */
  private readonly _trails = new Set<TrailRibbon>();
  private readonly _trailTweens = new Set<gsap.core.Tween>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(FactoryMatchConfig);
    this._world = resolver.getInstance(World);
    this._models = resolver.getInstance(ModelLibraryService);
  }

  public override postInitialize(): void {
    super.postInitialize();

    if (this._world) {
      this._prevFog = this._world.scene.fog ?? null;
      this._world.scene.fog = null;
      this._prevBackground = this._world.scene.background ?? null;
      this._world.scene.background = new THREE.Color(this._config!.background);
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

  /** Keep the ortho frustum matched to the viewport: the vertical extent zooms
   * with the aspect (clamped + lerped per `camera.zoom`) so the pool + tray stay
   * framed at the screen edges, while the horizontal extent follows the true
   * aspect so nothing is stretched. */
  public override onResize(width: number, height: number, _dpr: number): void {
    super.onResize(width, height, _dpr);
    const ortho = this._ortho;
    if (!ortho || width === 0 || height === 0) return;
    const aspect = width / height;
    const z = this._config!.camera.zoom;
    const span = z.maxAspect - z.minAspect;
    const t = span > 0 ? Math.max(0, Math.min(1, (aspect - z.minAspect) / span)) : 0; // clamp into the band
    const h = z.frustumAtMin + (z.frustumAtMax - z.frustumAtMin) * t;
    const w = h * aspect;
    ortho.left = -w / 2;
    ortho.right = w / 2;
    ortho.top = h / 2;
    ortho.bottom = -h / 2;
    ortho.updateProjectionMatrix();
  }

  //  PILE ENTITY — stage drives the returned adapter

  public createEntity(kind: Kind): Physics3DEntityView & { onSpawned(id: BodyId): void } {
    const obj = this._makeShape(kind);
    this.add(obj);
    this._pileObjects.add(obj);
    return {
      setTransform(t): void {
        obj.position.set(t.x, t.y, t.z);
        obj.quaternion.set(t.qx, t.qy, t.qz, t.qw);
      },
      onSpawned: (id: BodyId): void => {
        this._bodyByObject.set(obj, id);
      },
      dispose: (): void => {
        if (this._hovered === obj) this._setHover(null);
        this._pileObjects.delete(obj);
        this._bodyByObject.delete(obj);
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
    this._slots.set(result.addedId, { kind: result.kind, obj, index: -1 });
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
    this._clearTrails();
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

  public returnTrayItem(id: number, tx: number, ty: number, tz: number, onLanded: () => void): void {
    const slot = this._slots.get(id);
    if (!slot) {
      onLanded(); // mesh already gone — still spawn the pile body
      return;
    }
    const cfg = this._config!;
    const s = cfg.spring;
    const index = slot.index;
    const obj = slot.obj;
    this._slots.delete(id);
    this._order = this._order.filter((o) => o !== id);
    // The block springs STRAIGHT UP out of the tray first, then arcs over the
    // walls to the pool target: x/z hold during the jump and only glide across
    // once it's airborne. It grows from tray (quarter) size back to full pile size
    // on the way in.
    gsap.killTweensOf(obj.position);
    gsap.killTweensOf(obj.scale);
    gsap.killTweensOf(obj.rotation);
    const peakY = Math.max(obj.position.y, ty) + s.arcLift;
    const up = s.flyTime * Math.min(Math.max(s.jumpRatio, 0), 1); // jump-up phase
    const over = s.flyTime - up; // travel-to-pool phase
    gsap.to(obj.position, {
      keyframes: [
        { y: peakY, duration: up, ease: "power3.out" }, // punchy spring straight up
        { y: ty, duration: over, ease: "power2.in" }, // arc back down into the pool target
      ],
    });
    gsap.to(obj.position, {
      x: tx,
      z: tz,
      duration: over,
      delay: up, // hold over the tray through the jump, then fly across
      ease: "power1.in",
      // When the flight lands, drop the flown mesh and hand off to physics: a real
      // pile body spawns at the same spot and is thrown into the pile.
      onComplete: () => {
        PileView._disposeObject(obj);
        onLanded();
      },
    });
    gsap.to(obj.scale, { x: 1, y: 1, z: 1, duration: s.flyTime, ease: "power2.in" });
    // Close the gap first (neighbours shift in), then spring the vacated pad UP to
    // sell the launch — applied last so it wins over any neighbour landing on it.
    this._layout(null);
    if (index >= 0) this._springPad(index);
  }

  /** Spring a tray pad sharply UPWARD then settle it back — the catapult recoil
   * that launches a spring-boosted block out of the tray. */
  private _springPad(index: number): void {
    const pad = this._pads[index];
    if (!pad) return;
    const s = this._config!.spring;
    gsap.killTweensOf(pad.position);
    gsap.to(pad.position, {
      keyframes: [
        { y: this._padRestY + s.padJump, duration: s.padJumpTime, ease: "back.out(3)" }, // pop up
        { y: this._padRestY, duration: s.padJumpTime, ease: "power2.in" }, // settle back to rest
      ],
    });
  }

  /** Group by kind (stable), then animate every slotted shape to its rack position. */
  private _layout(flownId: number | null): void {
    const cfg = this._config!;
    let movedCount = 0; // staggers reorder hops so shifting items move in sequence
    this._order.forEach((id, index) => {
      const slot = this._slots.get(id);
      if (!slot) return;
      const target = this._slotPosition(index);
      const seatY = target.y + cfg.rack.itemLift;
      const isFlown = id === flownId;
      if (isFlown) {
        slot.index = index;
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
        this._startTrail(slot.obj, landTime);
      } else {
        // Seated neighbours hop only when their SLOT actually changes. Comparing
        // the target index (not the live position) means an item already settled
        // at — or still animating toward — this slot is left alone, so rapid picks
        // don't restart its tween and leave it hovering.
        if (slot.index === index) return;
        slot.index = index;
        const dip = cfg.rack.suspensionDip;
        const drop = Math.max(cfg.anim.trayDrop, 0);
        const hopTime = Math.max(cfg.anim.slide, drop); // stretched if the tray needs longer to give way
        const peakY = seatY + cfg.rack.shiftHop;
        // Shifting items hop one after another, a small fixed delay apart.
        const startDelay = movedCount * Math.max(cfg.anim.shiftStagger, 0);
        movedCount += 1;
        gsap.killTweensOf(slot.obj.position);
        gsap.to(slot.obj.position, {
          x: target.x,
          z: target.z,
          duration: hopTime,
          delay: startDelay,
          ease: "power2.inOut",
        });
        gsap.to(slot.obj.position, {
          keyframes: [
            { y: peakY, duration: hopTime * 0.4, ease: "power2.out" }, // hop up
            { y: seatY - dip, duration: hopTime * 0.6, ease: "power2.in" }, // come down onto the new slot
            { y: seatY, duration: drop, ease: "back.out(2.5)" }, // settle back up with the tray
          ],
          delay: startDelay,
        });
        // The destination pad gives way as the hopping item lands on it.
        this._suspend(index, drop, hopTime, startDelay);
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
  private _suspend(index: number, drop: number, landTime: number, startDelay = 0): void {
    const pad = this._pads[index];
    if (!pad) return;
    const dip = this._config!.rack.suspensionDip;
    const delay = startDelay + Math.max(0, landTime - drop);
    gsap.killTweensOf(pad.position);
    gsap.to(pad.position, {
      keyframes: [
        { y: this._padRestY - dip, duration: drop, ease: "power2.in" }, // fall to meet the block at the bottom
        { y: this._padRestY, duration: drop, ease: "back.out(2.5)" }, // rise back to rest together (same duration)
      ],
      delay,
    });
  }

  /** Trail a continuous ribbon behind the item along its flight to the tray, then
   * fade the whole strip out once it lands. */
  private _startTrail(obj: THREE.Object3D, duration: number): void {
    const cfg = this._config!.trail;
    const camera = this._world?.activeCamera;
    if (!cfg.enabled || !camera) return;
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const ribbon = new TrailRibbon(this, cfg.color, cfg.width, cfg.opacity, cfg.points, camDir);
    this._trails.add(ribbon);

    const driver = { t: 0 };
    const tween = gsap.to(driver, {
      t: 1,
      duration,
      ease: "none",
      onUpdate: () => ribbon.push(obj.position),
      onComplete: () => {
        this._trailTweens.delete(tween);
        ribbon.dissolve(cfg.fade, () => {
          this._trails.delete(ribbon);
          ribbon.dispose();
        });
      },
    });
    this._trailTweens.add(tween);
  }

  /** Kill any live trails (driver tweens + ribbons) — on reset and teardown. */
  private _clearTrails(): void {
    for (const tween of this._trailTweens) tween.kill();
    this._trailTweens.clear();
    for (const ribbon of this._trails) ribbon.dispose();
    this._trails.clear();
  }

  private _slotPosition(index: number): { x: number; y: number; z: number } {
    const cfg = this._config!;
    const cap = cfg.slots.capacity;
    const step = cfg.rack.padWidth + cfg.rack.gap; // centre-to-centre slot pitch
    return {
      x: (index - (cap - 1) / 2) * step,
      y: cfg.rack.y,
      z: cfg.rack.z,
    };
  }

  //  INPUT

  public onPick(cb: (bodyId: BodyId | null) => void): Unsubscribe {
    this._pickListeners.add(cb);
    return () => this._pickListeners.delete(cb);
  }

  private readonly _onPointerDown = (event: PointerEvent): void => {
    const camera = this._world?.activeCamera;
    const ndc = this._ndcFromEvent(event);
    if (!camera || !ndc) return;
    // Resolve the click against the visible meshes (precise), then report that
    // shape's body so the collected item always matches what the player sees —
    // box colliders alone would let a neighbour intercept a grazing ray.
    const picked = this._pickPileObject(event);
    const bodyId = picked ? (this._bodyByObject.get(picked) ?? null) : null;
    for (const cb of this._pickListeners) cb(bodyId);
    // Touch/pen: outline the pressed shape for as long as the finger is held.
    if (event.pointerType !== "mouse") {
      this._pressActive = true;
      this._setHover(picked);
    }
  };

  /** Mouse: outline whatever shape is under the cursor. Touch: track the held finger. */
  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (!this._interactive) return; // no hover before play starts / after it ends
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

  /** Enable/disable the selection outline; disabling clears any current one. */
  public setInteractive(enabled: boolean): void {
    this._interactive = enabled;
    if (!enabled) this._setHover(null);
  }

  /** Swap the outlined shape (no-op if unchanged). Pass null to clear. */
  private _setHover(obj: THREE.Object3D | null): void {
    const next = this._interactive ? obj : null; // no outline while non-interactive
    if (next === this._hovered) return;
    this._clearOutline();
    this._hovered = next;
    if (next) this._applyOutline(next);
  }

  /**
   * Thin screen-space outline drawn on top of everything. Two passes per mesh,
   * both depth-test-off so they ignore occluders:
   *   1) a stencil-only mask that marks the shape's on-screen silhouette (ref 1);
   *   2) an enlarged back-faces hull that draws only where the stencil is NOT 1 —
   *      i.e. just the rim outside the silhouette, not the filled interior.
   * The result is a clean contour around the visible 2D shape, floating over any
   * items stacked in front. Geometry is shared; only the per-pass materials are
   * disposed on clear.
   */
  private _applyOutline(obj: THREE.Object3D): void {
    const cfg = this._config!;
    // Collect first: adding children during traverse() would make traverse recurse
    // into the freshly added meshes → infinite recursion.
    const meshes: THREE.Mesh[] = [];
    obj.traverse((node) => {
      if (node instanceof THREE.Mesh) meshes.push(node);
    });
    for (const node of meshes) {
      const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
      maskMat.stencilWrite = true;
      maskMat.stencilRef = 1;
      maskMat.stencilFunc = THREE.AlwaysStencilFunc;
      maskMat.stencilZPass = THREE.ReplaceStencilOp;
      const mask = new THREE.Mesh(node.geometry, maskMat);
      mask.renderOrder = OUTLINE_MASK_ORDER;
      mask.raycast = (): void => {};
      node.add(mask);
      this._outlineParts.push(mask);

      const rimMat = new THREE.MeshBasicMaterial({
        color: cfg.outline.color,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      });
      rimMat.stencilWrite = true;
      rimMat.stencilRef = 1;
      rimMat.stencilFunc = THREE.NotEqualStencilFunc; // draw only outside the masked silhouette
      const rim = new THREE.Mesh(node.geometry, rimMat);
      rim.scale.setScalar(cfg.outline.scale);
      rim.renderOrder = OUTLINE_RIM_ORDER;
      rim.raycast = (): void => {};
      node.add(rim);
      this._outlineParts.push(rim);
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
    return this._models!.make(kind);
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
    if (bin.transparent) return; // pile floats on the background; colliders live in FactoryOperations
    const t = bin.wallThickness;
    const spanX = bin.halfWidth * 2 + t * 2;
    const spanZ = bin.halfDepth * 2 + t * 2;
    const edgeX = bin.halfWidth + t / 2;
    const edgeZ = bin.halfDepth + t / 2;
    const wy = bin.floorY + bin.wallHeight / 2;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(spanX, 0.2, spanZ),
      new THREE.MeshStandardMaterial({ color: bin.floorColor, roughness: 0.85, metalness: 0.05 }),
    );
    floor.position.set(0, bin.floorY - 0.1, 0);
    this._bin.add(floor);

    const glass = (): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color: bin.wallColor, transparent: true, opacity: 0.22, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(t, bin.wallHeight, spanZ), glass());
      w.position.set(sx * edgeX, wy, 0);
      this._bin.add(w);
    }
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(bin.halfWidth * 2, bin.wallHeight, t), glass());
      w.position.set(0, wy, sz * edgeZ);
      this._bin.add(w);
    }
  }

  private static _disposeObject(obj: THREE.Object3D): void {
    obj.removeFromParent();
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // Model clones share geometry + materials with the library prototype
      // (flagged `userData.shared`); only release resources we actually own.
      if (!o.geometry.userData.shared) o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m.userData.shared) m.dispose();
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
    this._bodyByObject.clear();
    this.clearSlots();
    PileView._disposeObject(this._bin);
    PileView._disposeObject(this._rack);
    if (this._world) {
      this._world.scene.fog = this._prevFog;
      this._world.scene.background = this._prevBackground;
      if (this._ortho) this._world.setActiveCamera(this._world.camera); // restore perspective
    }
    this._ortho = null;
    super.preDestroy();
  }
}
