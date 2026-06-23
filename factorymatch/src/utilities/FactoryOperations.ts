import type { IInstanceResolver } from "@gamebyte/gamelabsjs";
import {
  Physics3DManager,
  Physics3DStage,
  type Body3DDef,
  type BodyId,
  type Physics3DEntityView,
  type Transform3D,
} from "@gamebyte/gamelabsjs/physics3d";

import { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import { GameModel } from "../models/GameModel.js";
import { TimerModel } from "../models/TimerModel.js";
import type { Kind } from "../models/IGameModel.js";

/** Creates the mesh for a spawned pile shape. Injected by the controller; the engine never sees a renderer. */
export type EntityViewFactory = (kind: Kind) => Physics3DEntityView;

/** Result of a successful pick — drives the view's fly-to-slot + match animations. */
export interface CollectResult {
  addedId: number;
  kind: Kind;
  /** World position the shape was picked from (its physics pose), so the view can fly it from there. */
  from: { x: number; y: number; z: number };
  /** Ids removed by a 3-of-a-kind match this pick (includes the added id); empty if no match. */
  clearedIds: number[];
}

interface SlotItem {
  id: number;
  kind: Kind;
}

const KIND_ORDER: Kind[] = ["dice", "billardball", "guitar", "radio", "gascan"];

/**
 * All domain logic: builds the static bin (tall colliders) and the falling pile
 * via a Physics3DStage, resolves picks with a physics raycast, and runs the
 * slot/match rules. Returns a `CollectResult` the controller hands to the view
 * for the fly-to-slot animation. Owns no renderer — unit-testable with `FakePhysics3D`.
 */
export class FactoryOperations {
  private _physics: Physics3DManager | null = null;
  private _config: FactoryMatchConfig | null = null;
  private _model: GameModel | null = null;
  private _timer: TimerModel | null = null;
  private _stage: Physics3DStage | null = null;
  private _makeView: EntityViewFactory | null = null;

  /** Pickable pile bodies → kind. */
  private readonly _pile = new Map<BodyId, Kind>();
  /** Static bin collider bodies (no meshes — the view draws the glass bin). */
  private _binIds: BodyId[] = [];
  /** Logical slot contents, by unique item id. */
  private _slots: SlotItem[] = [];
  private _nextItemId = 1;
  private readonly _t: Transform3D = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  public inject(resolver: IInstanceResolver): void {
    this._physics = resolver.getInstance(Physics3DManager);
    this._config = resolver.getInstance(FactoryMatchConfig);
    this._model = resolver.getInstance(GameModel);
    this._timer = resolver.getInstance(TimerModel);
    this._stage = new Physics3DStage(this._physics);
  }

  public bindView(factory: EntityViewFactory): void {
    this._makeView = factory;
  }

  //  LEVEL BUILD

  public buildLevel(): void {
    for (const id of this._binIds) this._physics!.removeBody(id);
    this._binIds = [];
    this._stage!.clear();
    this._pile.clear();
    this._slots = [];
    this._nextItemId = 1;
    this._model!.reset();
    this._timer!.reset();

    this._buildBin();
    this._buildPile();
  }

  /** Bin colliders only (no meshes). Walls use a tall collider so shapes can't bounce out. */
  private _buildBin(): void {
    const { bin } = this._config!;
    const t = bin.wallThickness;
    const spanX = bin.halfWidth * 2 + t * 2;
    const spanZ = bin.halfDepth * 2 + t * 2;
    const ch = bin.wallColliderHeight;
    const wy = bin.floorY + ch / 2;
    const edgeX = bin.halfWidth + t / 2;
    const edgeZ = bin.halfDepth + t / 2;

    this._binIds.push(this._physics!.createBody(this._static(spanX, 0.2, spanZ, 0, bin.floorY - 0.1, 0)));
    for (const sx of [-1, 1]) {
      this._binIds.push(this._physics!.createBody(this._static(t, ch, spanZ, sx * edgeX, wy, 0)));
    }
    for (const sz of [-1, 1]) {
      this._binIds.push(this._physics!.createBody(this._static(bin.halfWidth * 2, ch, t, 0, wy, sz * edgeZ)));
    }
  }

  private _static(width: number, height: number, depth: number, x: number, y: number, z: number): Body3DDef {
    // collisionGroup 2 = "bin": still collides with everything, but the pick ray
    // (mask 1) skips it, so the tall walls don't block clicks on the pile.
    return { shape: { kind: "box", width, height, depth }, x, y, z, type: "static", friction: 0.6, collisionGroup: 2 };
  }

  private _buildPile(): void {
    const cfg = this._config!;
    const drops: Kind[] = [];
    for (const kind of KIND_ORDER) for (let i = 0; i < cfg.spawnPerKind; i++) drops.push(kind);
    this._shuffle(drops);

    drops.forEach((kind, i) => {
      const c = cfg.kinds[kind].collider;
      const id = this._stage!.spawn(
        {
          shape: { kind: "box", width: c.width, height: c.height, depth: c.depth },
          x: (Math.random() * 2 - 1) * cfg.spawn.areaHalf,
          y: cfg.spawn.baseY + i * cfg.spawn.stepY,
          z: (Math.random() * 2 - 1) * cfg.spawn.areaHalf,
          type: "dynamic",
          mass: 1,
          friction: 0.6,
          restitution: 0.04,
          tag: kind,
        },
        this._makeView!(kind),
      ).id;
      this._pile.set(id, kind);
    });
  }

  //  PICK (ray from the camera, world space) → collect

  public pick(ox: number, oy: number, oz: number, fx: number, fy: number, fz: number): CollectResult | null {
    if (this._model!.status !== "playing") return null;
    // Pick ray hits only group-1 bodies (the pile), passing through the bin (group 2).
    const hit = this._physics!.raycast(ox, oy, oz, fx, fy, fz, { collisionMask: 1 });
    if (!hit) return null;
    const kind = this._pile.get(hit.body);
    if (kind === undefined) return null; // hit the bin, not a shape

    const cfg = this._config!;

    const t = this._physics!.getTransform(hit.body, this._t);
    const from = { x: t.x, y: t.y, z: t.z };
    this._stage!.despawn(hit.body); // collider off — the shape leaves the simulation
    this._pile.delete(hit.body);

    const addedId = this._nextItemId++;
    this._slots.push({ id: addedId, kind });

    let clearedIds: number[] = [];
    const sameIds = this._slots.filter((s) => s.kind === kind).map((s) => s.id);
    if (sameIds.length >= cfg.slots.matchCount) {
      clearedIds = sameIds.slice(-cfg.slots.matchCount);
      const cleared = new Set(clearedIds);
      this._slots = this._slots.filter((s) => !cleared.has(s.id));
      this._model!.setScore(this._model!.score + cfg.slots.matchPoints);
    }

    // Win on an empty pile; otherwise lose the moment the tray fills with no room
    // left (this pick reached capacity without clearing a match).
    if (this._pile.size === 0) this._model!.setStatus("won");
    else if (this._slots.length >= cfg.slots.capacity) this._model!.setLost("tray");

    return { addedId, kind, from, clearedIds };
  }

  //  PER-FRAME / LIFECYCLE

  public update(dt: number): void {
    this._stage!.sync();
    // Countdown only runs while playing; hitting zero ends the game.
    if (this._model!.status !== "playing") return;
    this._timer!.tick(dt);
    if (this._timer!.elapsedSeconds >= this._config!.time.startSeconds) this._model!.setLost("time");
  }

  public reset(): void {
    this.buildLevel();
  }

  public destroy(): void {
    for (const id of this._binIds) this._physics?.removeBody(id);
    this._binIds = [];
    this._stage?.clear();
    this._pile.clear();
    this._slots = [];
    this._physics = null;
    this._config = null;
    this._model = null;
    this._timer = null;
    this._stage = null;
    this._makeView = null;
  }

  private _shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
