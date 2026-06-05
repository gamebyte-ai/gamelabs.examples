import * as THREE from "three";
import gsap from "gsap";
import { WorldViewBase, World, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Physics3DEntityView } from "@gamebyte/gamelabsjs/physics3d";
import type { IPileView } from "./IPileView.js";
import { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import type { CollectResult } from "../utilities/FactoryOperations.js";
import type { Kind } from "../models/IGameModel.js";

const PICK_RANGE = 40;
const KIND_ORDER: Kind[] = ["cube", "cylinder", "plus", "triprism"];

interface SlotMesh {
  kind: Kind;
  obj: THREE.Object3D;
}

/**
 * World (3D) view: renders the bin (tall colliders are owned by operations; the
 * glass walls here are visual only), the physics-driven pile, and a 3D slot rack
 * that collected shapes fly into (GSAP-animated, with slide-on-reorder and a
 * pop on match). Reports clicks as a world-space ray for the physics raycast.
 */
export class PileView extends WorldViewBase implements IPileView {
  private _config: FactoryMatchConfig | null = null;
  private _world: World | null = null;
  private _prevFog: THREE.Scene["fog"] = null;
  private readonly _bin = new THREE.Group();
  private readonly _rack = new THREE.Group();

  private readonly _ray = new THREE.Raycaster();
  private readonly _pickListeners = new Set<
    (ox: number, oy: number, oz: number, fx: number, fy: number, fz: number) => void
  >();
  private _pointerTarget: HTMLElement | null = null;

  /** Slotted (collected) shapes by item id, plus their display order. */
  private readonly _slots = new Map<number, SlotMesh>();
  private _order: number[] = [];

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
    const cam = this._world?.camera;
    const cfg = this._config!;
    if (cam) {
      cam.position.set(cfg.camera.position.x, cfg.camera.position.y, cfg.camera.position.z);
      cam.lookAt(cfg.camera.lookAt.x, cfg.camera.lookAt.y, cfg.camera.lookAt.z);
    }

    this._buildBinVisual();
    this._buildRackVisual();
    this.add(this._bin, this._rack);

    const canvas = this._world?.renderer.domElement;
    this._pointerTarget = canvas?.parentElement ?? canvas ?? null;
    this._pointerTarget?.addEventListener("pointerdown", this._onPointerDown);
  }

  //  PILE ENTITY — stage drives the returned adapter

  public createEntity(kind: Kind): Physics3DEntityView {
    const obj = this._makeShape(kind);
    this.add(obj);
    return {
      setTransform(t): void {
        obj.position.set(t.x, t.y, t.z);
        obj.quaternion.set(t.qx, t.qy, t.qz, t.qw);
      },
      dispose(): void {
        PileView._disposeObject(obj);
      },
    };
  }

  //  SLOT RACK — collected shapes fly here and line up

  public applyCollect(result: CollectResult): void {
    const cfg = this._config!;
    // Spawn the collected shape at the pile pose + full size; it shrinks to
    // `itemScale` (a quarter) as it flies to the slot (animated in _layout).
    const obj = this._makeShape(result.kind);
    obj.position.set(result.from.x, result.from.y, result.from.z);
    this.add(obj);
    this._slots.set(result.addedId, { kind: result.kind, obj });
    this._order.push(result.addedId);
    this._sortOrder();
    this._layout(result.addedId);

    if (result.clearedIds.length > 0) {
      const cleared = new Set(result.clearedIds);
      // Let the flown shape land, then pop the trio and slide survivors closed.
      gsap.delayedCall(cfg.anim.fly, () => {
        for (const id of cleared) this._pop(id);
        this._order = this._order.filter((id) => !cleared.has(id));
        this._layout(null);
      });
    }
  }

  public clearSlots(): void {
    for (const { obj } of this._slots.values()) {
      gsap.killTweensOf(obj.position);
      gsap.killTweensOf(obj.scale);
      gsap.killTweensOf(obj.rotation);
      PileView._disposeObject(obj);
    }
    this._slots.clear();
    this._order = [];
  }

  /** Group by kind (stable), then animate every slotted shape to its rack position. */
  private _layout(flownId: number | null): void {
    const cfg = this._config!;
    this._order.forEach((id, index) => {
      const slot = this._slots.get(id);
      if (!slot) return;
      const target = this._slotPosition(index);
      const isFlown = id === flownId;
      gsap.to(slot.obj.position, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: isFlown ? cfg.anim.fly : cfg.anim.slide,
        ease: isFlown ? "power2.out" : "power2.inOut",
        overwrite: true,
      });
      if (isFlown) {
        gsap.to(slot.obj.rotation, { x: 0, y: 0, z: 0, duration: cfg.anim.fly, overwrite: true });
        gsap.to(slot.obj.scale, {
          x: cfg.rack.itemScale,
          y: cfg.rack.itemScale,
          z: cfg.rack.itemScale,
          duration: cfg.anim.fly,
          ease: "power2.out",
          overwrite: true,
        });
      }
    });
  }

  private _pop(id: number): void {
    const slot = this._slots.get(id);
    if (!slot) return;
    this._slots.delete(id);
    gsap.killTweensOf(slot.obj.position);
    gsap.to(slot.obj.scale, {
      x: 0,
      y: 0,
      z: 0,
      duration: this._config!.anim.pop,
      ease: "back.in(2)",
      overwrite: true,
      onComplete: () => PileView._disposeObject(slot.obj),
    });
  }

  private _sortOrder(): void {
    this._order.sort((a, b) => {
      const ka = this._slots.get(a)?.kind;
      const kb = this._slots.get(b)?.kind;
      return KIND_ORDER.indexOf(ka as Kind) - KIND_ORDER.indexOf(kb as Kind);
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
    const world = this._world;
    const camera = world?.activeCamera;
    const canvas = world?.renderer.domElement;
    if (!world || !camera || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this._ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const o = this._ray.ray.origin;
    const d = this._ray.ray.direction;
    for (const cb of this._pickListeners) {
      cb(o.x, o.y, o.z, o.x + d.x * PICK_RANGE, o.y + d.y * PICK_RANGE, o.z + d.z * PICK_RANGE);
    }
  };

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
    const padW = cfg.rack.spacing * 0.82;
    const padY = cfg.rack.y - 0.0925; // top sits just under a quarter-scale shape
    for (let i = 0; i < cfg.slots.capacity; i++) {
      const pos = this._slotPosition(i);
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(padW, 0.06, 0.34),
        new THREE.MeshStandardMaterial({ color: cfg.rack.padColor, roughness: 0.85, metalness: 0.05 }),
      );
      pad.position.set(pos.x, padY, pos.z);
      this._rack.add(pad);
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
    this._pointerTarget = null;
    this._pickListeners.clear();
    this.clearSlots();
    PileView._disposeObject(this._bin);
    PileView._disposeObject(this._rack);
    if (this._world) this._world.scene.fog = this._prevFog;
    super.preDestroy();
  }
}
