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

/** Creates the mesh for a spawned pile shape. Injected by the controller; the
 * engine never sees a renderer. `onSpawned` (if present) is called with the new
 * body id so the view can map its mesh → body for precise picking. */
export type EntityViewFactory = (kind: Kind) => Physics3DEntityView & { onSpawned?(id: BodyId): void };

/** Result of a successful pick — drives the view's fly-to-slot + match animations. */
export interface CollectResult {
  addedId: number;
  kind: Kind;
  /** World position the shape was picked from (its physics pose), so the view can fly it from there. */
  from: { x: number; y: number; z: number };
  /** Ids removed by a 3-of-a-kind match this pick (includes the added id); empty if no match. */
  clearedIds: number[];
  /** The goal this pick advanced (its kind matched a goal and it wasn't already
   * complete), with the new remaining count — null otherwise. */
  goal: { index: number; remaining: number } | null;
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
  /** Seconds of physics simulation still owed; the world is stepped only while > 0
   * so an idle pile freezes instead of jittering. */
  private _settle = 0;
  /** Seconds until the next pick is allowed (input cooldown after a collect). */
  private _pickCooldown = 0;
  /** Seconds of fan-booster swirl still owed (tornado force on the pile). */
  private _swirl = 0;
  /** Remaining count per goal (parallel to config.goals), counted down on collect. */
  private _goalRemaining: number[] = [];
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
    this._settle = this._config!.physics.initialSettleSeconds; // let the drop settle, then freeze
    this._goalRemaining = this._config!.goals.map((g) => g.target);

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
    // Pin each wall's INNER face at the play-area boundary (halfWidth/halfDepth)
    // and centre it half a thickness outside, so growing `wallThickness` extends
    // the wall strictly outward — it never eats into the play area.
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
    for (const kind of KIND_ORDER) for (let i = 0; i < cfg.spawnPerKind[kind]; i++) drops.push(kind);
    this._shuffle(drops);

    // Lay items out on a loose grid that fills the bin and stacks in layers, so
    // they spawn together as a compact cloud (no tall single-column tower) and
    // start low. Grid cells are sized to avoid spawn overlap.
    const { cell, layerGap, baseY, jitter } = cfg.spawn;
    const cols = Math.max(1, Math.floor((cfg.bin.halfWidth * 2) / cell));
    const rows = Math.max(1, Math.floor((cfg.bin.halfDepth * 2) / cell));
    const perLayer = cols * rows;
    const rand = (): number => (Math.random() * 2 - 1) * jitter;
    const clamp = (v: number, lim: number): number => Math.max(-lim, Math.min(lim, v));

    drops.forEach((kind, i) => {
      const c = cfg.kinds[kind].collider;
      const layer = Math.floor(i / perLayer);
      const slot = i % perLayer;
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      // Keep the whole item (incl. jitter) inside the walls so nothing spawns
      // outside the bin and falls away.
      const limX = Math.max(0, cfg.bin.halfWidth - c.width / 2);
      const limZ = Math.max(0, cfg.bin.halfDepth - c.depth / 2);
      const view = this._makeView!(kind);
      const id = this._stage!.spawn(
        {
          shape: { kind: "box", width: c.width, height: c.height, depth: c.depth },
          x: clamp((col - (cols - 1) / 2) * cell + rand(), limX),
          y: baseY + layer * layerGap + rand(),
          z: clamp((row - (rows - 1) / 2) * cell + rand(), limZ),
          type: "dynamic",
          mass: 1,
          // friction/restitution come from the world default contact material
          // (FactoryMatchConfig.physics) so item↔item contacts honour them too.
          tag: kind,
        },
        view,
      ).id;
      this._pile.set(id, kind);
      view.onSpawned?.(id); // let the view map this mesh → body for precise picking
    });
  }

  //  PICK — collect a specific pile body (chosen by the view's visual raycast)

  /** Begin play once the intro countdown completes (enables picks + the clock).
   * Also closes the pool with a ceiling collider so boosters can't fling items
   * out the top (the open top let the initial drop fall in first). */
  public start(): void {
    if (this._model!.started) return;
    this._model!.setStarted(true);
    this._addLid();
  }

  /** Fan booster: spin the pile into a clockwise tornado for a few seconds. */
  public activateFan(): void {
    if (!this._model!.started || this._model!.status !== "playing") return;
    const fan = this._config!.fan;
    this._swirl = fan.duration;
    // Keep the pile simulated through the swirl AND a settle-out window after it.
    this._settle = Math.max(this._settle, fan.duration + fan.settleAfter);
  }

  /** Swirl strength multiplier 0→1→0 across the booster's life: smoothstep ramp-in
   * over `ramp`, full in the middle, smoothstep ramp-out over the last `ramp`. */
  private _swirlIntensity(): number {
    const fan = this._config!.fan;
    if (fan.ramp <= 0) return 1;
    const elapsed = fan.duration - this._swirl; // time since the fan started
    const lin = Math.max(0, Math.min(1, Math.min(elapsed, this._swirl) / fan.ramp));
    return lin * lin * (3 - 2 * lin); // smoothstep
  }

  /** Ceiling collider at `bin.lidHeight` above the floor, spanning the pool. */
  private _addLid(): void {
    const { bin } = this._config!;
    const t = bin.wallThickness;
    const spanX = bin.halfWidth * 2 + t * 2;
    const spanZ = bin.halfDepth * 2 + t * 2;
    this._binIds.push(this._physics!.createBody(this._static(spanX, t, spanZ, 0, bin.floorY + bin.lidHeight, 0)));
  }

  /** Collect the given pile body. The view resolves which body via a precise mesh
   * raycast, so the collected item always matches the one the player sees/outlines
   * (box colliders alone would let a neighbour intercept the ray). */
  public pick(bodyId: BodyId): CollectResult | null {
    if (!this._model!.started || this._model!.status !== "playing") return null;
    if (this._pickCooldown > 0) return null; // wait out the post-pick delay
    const kind = this._pile.get(bodyId);
    if (kind === undefined) return null; // already collected / not a pile body

    const cfg = this._config!;

    const t = this._physics!.getTransform(bodyId, this._t);
    const from = { x: t.x, y: t.y, z: t.z };
    this._stage!.despawn(bodyId); // collider off — the shape leaves the simulation
    this._pile.delete(bodyId);
    this._settle = cfg.physics.settleSeconds; // wake the pile so it resettles into the gap, then freeze
    this._pickCooldown = cfg.pickCooldown; // block the next pick briefly

    const addedId = this._nextItemId++;
    this._slots.push({ id: addedId, kind });

    // Count this collection against its goal (if any), once per single pickup.
    let goal: { index: number; remaining: number } | null = null;
    const goalIndex = cfg.goals.findIndex((g) => g.kind === kind);
    if (goalIndex >= 0 && this._goalRemaining[goalIndex]! > 0) {
      this._goalRemaining[goalIndex] -= 1;
      goal = { index: goalIndex, remaining: this._goalRemaining[goalIndex]! };
    }

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

    return { addedId, kind, from, clearedIds, goal };
  }

  //  PER-FRAME / LIFECYCLE

  /** True while the pile should be simulated; the app gates `physics.step` on it. */
  public get physicsActive(): boolean {
    return this._settle > 0;
  }

  public update(dt: number): void {
    this._stage!.sync();
    if (this._settle > 0) this._settle = Math.max(0, this._settle - dt); // burn down the physics-on window
    if (this._pickCooldown > 0) this._pickCooldown = Math.max(0, this._pickCooldown - dt); // burn down the pick cooldown
    // The clock only runs once play has begun (after the intro countdown) and
    // while playing; hitting zero ends the game.
    if (!this._model!.started || this._model!.status !== "playing") return;
    this._timer!.tick(dt);
    if (this._timer!.elapsedSeconds >= this._config!.time.startSeconds) this._model!.setLost("time");

    // Per-body forces while the pile is simulated: the gravity correction (drop →
    // after-start), plus the fan booster's clockwise tornado when active.
    if (this._settle > 0) {
      const phys = this._config!.physics;
      const fan = this._config!.fan;
      const dg = phys.gravityAfterStart - phys.gravity; // bodies have mass 1, so force == accel
      const swirling = this._swirl > 0;
      // Ease the swirl in at the start and out at the end (smoothstep over `ramp`)
      // so the fan ramps up/down instead of snapping on/off.
      const intensity = swirling ? this._swirlIntensity() : 0;
      if (dg !== 0 || swirling) {
        for (const id of this._pile.keys()) {
          let fx = 0;
          let fz = 0;
          let fy = dg;
          if (swirling) {
            const t = this._physics!.getTransform(id, this._t); // radial from the pool centre (0,0)
            const r = Math.hypot(t.x, t.z) || 1;
            const spin = fan.strength * intensity;
            const pull = fan.inward * intensity;
            // tangential spin (perpendicular to the radius) + inward pull to the centre
            fx += ((t.z / r) * spin) * fan.direction - (t.x / r) * pull;
            fz += ((-t.x / r) * spin) * fan.direction - (t.z / r) * pull;
            // Lift is strongest at the floor and fades to 0 at `height`, so items
            // are drawn up into a column that tall (not all blasted to the ceiling).
            const rel = Math.max(0, 1 - (t.y - this._config!.bin.floorY) / fan.height);
            fy += fan.lift * intensity * rel;
          }
          this._physics!.applyForce(id, fx, fy, fz);
        }
      }
      if (swirling) this._swirl = Math.max(0, this._swirl - dt);
    }
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
