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
import type { Kind } from "../constants/Kind.js";

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

const KIND_ORDER: Kind[] = ["cube", "sphere", "cylinder", "cuboid", "pyramid"];

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
  /** Spring-returned bodies still dropping into the pool → seconds until pickable
   * again (they can't be re-collected mid-air, only once they've entered the pool). */
  private readonly _pickLock = new Map<BodyId, number>();
  /** Static bin collider bodies (no meshes — the view draws the glass bin). */
  private _binIds: BodyId[] = [];
  /** Logical slot contents, by unique item id. */
  private _slots: SlotItem[] = [];
  private _nextItemId = 1;
  /** Seconds until the next pick is allowed (input cooldown after a collect). */
  private _pickCooldown = 0;
  /** Seconds of fan-booster swirl still owed (tornado force on the pile). */
  private _swirl = 0;
  /** Remaining count per goal (parallel to config.goals), counted down on collect. */
  private _goalRemaining: number[] = [];
  /** Combo multiplier state: `_comboLevel` (≥1, the displayed x-factor) and
   * `_comboFill` (0→1 progress around the current lap). Each match adds to the
   * fill and multiplies match points; the fill drains every frame. */
  private _comboLevel = 1;
  private _comboFill = 0;
  /** Per-booster charge in matches (capped at its matchCount). Each match charges
   * both; a booster is usable at full charge, then resets to 0 when used. */
  private _fanCharge = 0;
  private _springCharge = 0;
  /** Set when a full tray was held open by a charged spring (the loss was deferred);
   * the controller reads + clears it to pulse the spring booster as a prompt. */
  private _springPromptPending = false;
  private readonly _t: Transform3D = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  private readonly _v = { x: 0, y: 0, z: 0 }; // scratch for velocity reads

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
    this._pickLock.clear();
    this._slots = [];
    this._nextItemId = 1;
    this._model!.reset();
    this._timer!.reset();
    this._goalRemaining = this._config!.goals.map((g) => g.target);
    this._comboLevel = 1;
    this._comboFill = 0;
    this._fanCharge = 0;
    this._springCharge = 0;
    this._springPromptPending = false;

    this._buildBin();
    this._buildPile();
    // Freshly spawned bodies are awake and fall under world gravity; cannon's
    // auto-sleep settles them once at rest (no manual wake window needed).
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

    this._binIds.push(this._physics!.createBody(this._static(spanX, 0.2, spanZ, 0, bin.floorY - 0.1, 0, bin.floorFriction)));
    for (const sx of [-1, 1]) {
      this._binIds.push(this._physics!.createBody(this._static(t, ch, spanZ, sx * edgeX, wy, 0)));
    }
    for (const sz of [-1, 1]) {
      this._binIds.push(this._physics!.createBody(this._static(bin.halfWidth * 2, ch, t, 0, wy, sz * edgeZ)));
    }
  }

  private _static(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    friction: number = this._config!.bin.wallFriction,
  ): Body3DDef {
    // collisionGroup 2 = "bin": still collides with everything, but the pick ray
    // (mask 1) skips it, so the tall walls don't block clicks on the pile.
    return {
      shape: { kind: "box", width, height, depth },
      x,
      y,
      z,
      type: "static",
      friction, // walls/lid default to bin.wallFriction; the floor passes its own
      restitution: this._config!.bin.wallRestitution,
      collisionGroup: 2,
    };
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
      this._spawnBody(
        kind,
        clamp((col - (cols - 1) / 2) * cell + rand(), limX),
        baseY + layer * layerGap + rand(),
        clamp((row - (rows - 1) / 2) * cell + rand(), limZ),
      );
    });
  }

  /** Spawn one dynamic pile body of `kind` at (x,y,z) and pair it with a fresh
   * view mesh. friction/restitution come from the world default contact material. */
  private _spawnBody(kind: Kind, x: number, y: number, z: number): BodyId {
    const c = this._config!.kinds[kind].collider;
    const view = this._makeView!(kind);
    const id = this._stage!.spawn(
      {
        shape: { kind: "box", width: c.width, height: c.height, depth: c.depth },
        x,
        y,
        z,
        rotation: this._spawnRotation(),
        type: "dynamic",
        mass: 1,
        tag: kind,
      },
      view,
    ).id;
    this._pile.set(id, kind);
    view.onSpawned?.(id); // let the view map this mesh → body for precise picking
    return id;
  }

  /** A random spawn orientation: a multiple of `spawn.spinStepDegrees` about
   * `spawn.spinAxis`, so identical models don't all line up the same way.
   * Returns identity when the step is 0 (disabled). */
  private _spawnRotation(): { x: number; y: number; z: number; w: number } {
    const { spinAxis, spinStepDegrees } = this._config!.spawn;
    if (spinStepDegrees <= 0) return { x: 0, y: 0, z: 0, w: 1 };
    const steps = Math.max(1, Math.round(360 / spinStepDegrees));
    const angle = (Math.floor(Math.random() * steps) * spinStepDegrees * Math.PI) / 180;
    const s = Math.sin(angle / 2);
    const cw = Math.cos(angle / 2);
    return {
      x: spinAxis === "x" ? s : 0,
      y: spinAxis === "y" ? s : 0,
      z: spinAxis === "z" ? s : 0,
      w: cw,
    };
  }

  //  WAKE — nudge a region awake after a pick (cannon auto-sleep handles re-settling)

  /** Wake the pile bodies a vertical cylinder touches — radius `pickWake.radius`
   * around (cx,cz), with its BASE at (cy) rising `pickWake.height` — so the stack
   * ABOVE a removed item resettles into the gap. Removing a body fires no contact,
   * so the sleeping supporters above it must be woken explicitly; bodies below stay
   * asleep as the support. Horizontal distance only; capped to `max`. Waking is via
   * `setVelocity(0,0,0)`, which the manager turns into a `wakeUp`. */
  private _wakeColumn(cx: number, cy: number, cz: number): void {
    const pw = this._config!.pickWake;
    const r2 = pw.radius * pw.radius;
    const yMin = cy;
    const yMax = cy + pw.height;
    const hits: { id: BodyId; d2: number }[] = [];
    for (const id of this._pile.keys()) {
      const t = this._physics!.getTransform(id, this._t);
      if (t.y < yMin || t.y > yMax) continue; // outside the cylinder's vertical span
      const dx = t.x - cx;
      const dz = t.z - cz;
      const d2 = dx * dx + dz * dz; // horizontal distance to the cylinder axis
      if (d2 <= r2) hits.push({ id, d2 });
    }
    if (pw.max > 0 && hits.length > pw.max) {
      hits.sort((a, b) => a.d2 - b.d2);
      hits.length = pw.max;
    }
    for (const h of hits) this._physics!.setVelocity(h.id, 0, 0, 0); // wakes it; gravity takes over
  }

  //  PICK — collect a specific pile body (chosen by the view's visual raycast)

  /** Begin play once the intro countdown completes (enables picks + the clock).
   * Also closes the pool with a ceiling collider so boosters can't fling items
   * out the top (the open top let the initial drop fall in first). */
  public start(): void {
    if (this._model!.started) return;
    this._model!.setStarted(true);
    this._addLid();
    if (this._config!.boosters.startCharged) {
      // TEST: hand the player both boosters fully charged at game start.
      this._fanCharge = this._config!.boosters.fanMatchCount;
      this._springCharge = this._config!.boosters.springMatchCount;
    }
  }

  /** Spring booster: take the most recently collected tray item out of the tray
   * and pick a target inside the pool for it. The view flies the item there (over
   * the tall walls), then calls back to `dropReturnedBody`. Returns the slot id +
   * kind + target, or null if the tray is empty / not in play. */
  public returnLastItem(): { id: number; kind: Kind; x: number; y: number; z: number } | null {
    if (!this._model!.started || this._model!.status !== "playing") return null;
    if (this._springCharge < this._config!.boosters.springMatchCount) return null; // not charged yet
    const item = this._slots.pop(); // last collected still in the tray
    if (!item) return null; // tray empty — keep the charge for when there's something to throw
    this._springCharge = 0; // consume the charge
    const cfg = this._config!;
    const s = cfg.spring;
    const c = cfg.kinds[item.kind].collider;
    const spread = (half: number, h: number): number =>
      (Math.random() * 2 - 1) * Math.max(0, Math.min(s.scatter, half - h / 2));
    return {
      id: item.id,
      kind: item.kind,
      x: spread(cfg.bin.halfWidth, c.width),
      y: cfg.bin.floorY + s.spawnHeight,
      z: spread(cfg.bin.halfDepth, c.depth),
    };
  }

  /** Spawn the returned item as a pile body at the release point the view flew it
   * to, then THROW it into the pile: a hard downward launch plus a random
   * horizontal kick so it tumbles in rather than being set down. */
  public dropReturnedBody(kind: Kind, x: number, y: number, z: number): void {
    if (!this._stage || !this._makeView) return; // torn down mid-flight
    const s = this._config!.spring;
    const id = this._spawnBody(kind, x, y, z);
    const kick = (): number => (Math.random() * 2 - 1) * s.throwKick;
    this._physics!.setVelocity(id, kick(), -s.throwSpeed, kick());
    this._pickLock.set(id, s.pickLock); // not re-pickable until it has dropped into the pool
    // The thrown body is already awake (just spawned + given velocity); wake the
    // column it's about to crash into so the pile opens up and resettles.
    this._wakeColumn(x, y, z);
  }

  /** Fan booster: spin the pile into a clockwise tornado for a few seconds. */
  public activateFan(): void {
    if (!this._model!.started || this._model!.status !== "playing") return;
    if (this._fanCharge < this._config!.boosters.fanMatchCount) return; // not charged yet
    this._fanCharge = 0; // consume the charge
    this._triggerSwirl();
  }

  /** Start the tornado over the WHOLE pile. The per-frame swirl in `update` sets
   * each item's velocity along the spiral field, which also wakes any sleeping
   * body — so no explicit wake (or friction change) is needed here. */
  private _triggerSwirl(): void {
    this._swirl = this._config!.fan.duration;
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
    if (this._pickLock.has(bodyId)) return null; // spring-returned, still dropping into the pool

    const cfg = this._config!;

    // Tray already full but held open by a charged spring (a prior pick deferred
    // the loss): block this pick so the tray can't overflow, and re-prompt the
    // spring instead. If somehow not charged, the loss stands.
    if (this._slots.length >= cfg.slots.capacity) {
      if (this._springCharge >= cfg.boosters.springMatchCount) this._springPromptPending = true;
      else this._model!.setLost("tray");
      return null;
    }

    const t = this._physics!.getTransform(bodyId, this._t);
    const from = { x: t.x, y: t.y, z: t.z };
    this._stage!.despawn(bodyId); // collider off — the shape leaves the simulation
    this._pile.delete(bodyId);
    // Wake the vertical column over the gap so the stack above it falls in and
    // resettles (everything else stays asleep until a collision wakes it).
    this._wakeColumn(from.x, from.y, from.z);
    this._pickCooldown = cfg.pickCooldown; // block the next pick briefly

    const addedId = this._nextItemId++;
    this._slots.push({ id: addedId, kind });
    // All score gains scale with the live combo multiplier (x1 = neutral, x2+ boosts).
    this._model!.setScore(this._model!.score + cfg.slots.collectPoints * this._comboLevel); // points for taking it into the tray

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
      // Match points + cash both scale with the current combo level (x1, x2, …);
      // then this match feeds the combo ring (which may bump the level next match).
      this._model!.setScore(this._model!.score + cfg.slots.matchPoints * this._comboLevel);
      this._model!.setCash(this._model!.cash + cfg.slots.cashPerMatch * this._comboLevel);
      this._addCombo();
      this._chargeBoosters();
    }

    // Win once every goal is met (all goal items collected); otherwise the tray
    // filling up loses — UNLESS a charged spring can rescue, in which case defer
    // the loss and prompt the player to use the spring (the controller pulses it).
    if (this._goalRemaining.every((r) => r <= 0)) {
      this._model!.setStatus("won");
    } else if (this._slots.length >= cfg.slots.capacity) {
      if (this._springCharge >= cfg.boosters.springMatchCount) this._springPromptPending = true;
      else this._model!.setLost("tray");
    }

    return { addedId, kind, from, clearedIds, goal };
  }

  //  COMBO MULTIPLIER

  /** Current combo multiplier (the displayed x-factor, ≥1). */
  public get comboLevel(): number {
    return this._comboLevel;
  }
  /** Ring fill of the current lap (0→1). */
  public get comboFill(): number {
    return this._comboFill;
  }

  /** A match feeds the ring: add a step, and roll over to the next level (carrying
   * the remainder) for every full lap completed. */
  private _addCombo(): void {
    this._comboFill += this._config!.combo.step;
    while (this._comboFill >= 1) {
      this._comboFill -= 1;
      this._comboLevel += 1;
    }
  }

  /** Drain the ring over time. Draining a full lap drops a level (the ring wraps
   * to full in the lower colour); at level 1 it bottoms out and the combo ends. */
  private _decayCombo(dt: number): void {
    if (this._comboLevel <= 1 && this._comboFill <= 0) return; // idle — nothing to drain
    this._comboFill -= this._config!.combo.decayPerSecond * dt;
    while (this._comboFill < 0) {
      if (this._comboLevel > 1) {
        this._comboLevel -= 1;
        this._comboFill += 1;
      } else {
        this._comboFill = 0; // x1 floor — combo over
        break;
      }
    }
  }

  //  BOOSTER CHARGE

  /** Fan booster charge fill (0→1). */
  public get fanFill(): number {
    return Math.min(1, this._fanCharge / this._config!.boosters.fanMatchCount);
  }
  /** Spring booster charge fill (0→1). */
  public get springFill(): number {
    return Math.min(1, this._springCharge / this._config!.boosters.springMatchCount);
  }

  /** True once if the last pick met a full tray held open by a charged spring (the
   * loss was deferred); reading it clears the flag. The controller pulses the
   * spring booster so the player knows to use it. */
  public consumeSpringPrompt(): boolean {
    const v = this._springPromptPending;
    this._springPromptPending = false;
    return v;
  }

  /** A match charges both boosters by one match, each capped at its own count. */
  private _chargeBoosters(): void {
    const b = this._config!.boosters;
    this._fanCharge = Math.min(b.fanMatchCount, this._fanCharge + 1);
    this._springCharge = Math.min(b.springMatchCount, this._springCharge + 1);
  }

  /** Empty tray slots remaining (capacity − collected). 1 = the danger state where
   * the next non-matching pick fills the tray. */
  public get slotsLeft(): number {
    return this._config!.slots.capacity - this._slots.length;
  }

  //  PER-FRAME / LIFECYCLE

  /** True while a pile exists; the app gates `physics.step` on it. cannon's
   * auto-sleep makes stepping a fully-settled pile cheap — the solver skips
   * sleeping bodies, so there's no need to track wake windows ourselves. */
  public get physicsActive(): boolean {
    return this._pile.size > 0;
  }

  public update(dt: number): void {
    this._stage!.sync();
    // Speed cap: rein in any moving body the step over-accelerated (squeeze/collision
    // ejections, worst at the packed initial drop). Scales velocity back to maxSpeed,
    // keeping direction. Sleeping bodies read ~0 velocity, so they're skipped (and not
    // woken). Runs pre-playing too, so the opening drop is capped.
    const maxSpeed = this._config!.physics.maxSpeed;
    if (maxSpeed > 0 && this._pile.size > 0) {
      const max2 = maxSpeed * maxSpeed;
      for (const id of this._pile.keys()) {
        const v = this._physics!.getVelocity(id, this._v);
        const sp2 = v.x * v.x + v.y * v.y + v.z * v.z;
        if (sp2 > max2) {
          const k = maxSpeed / Math.sqrt(sp2);
          this._physics!.setVelocity(id, v.x * k, v.y * k, v.z * k);
        }
      }
    }
    if (this._pickCooldown > 0) this._pickCooldown = Math.max(0, this._pickCooldown - dt); // burn down the pick cooldown
    // Burn down per-body re-pick locks (spring-returned items dropping in); unlock at zero.
    for (const [id, left] of this._pickLock) {
      const next = left - dt;
      if (next <= 0) this._pickLock.delete(id);
      else this._pickLock.set(id, next);
    }
    // The clock only runs once play has begun (after the intro countdown) and
    // while playing; hitting zero ends the game.
    if (!this._model!.started || this._model!.status !== "playing") return;
    this._timer!.tick(dt);
    if (this._timer!.elapsedSeconds >= this._config!.time.startSeconds) this._model!.setLost("time");
    this._decayCombo(dt); // the combo ring drains continuously while playing

    // Fan tornado: while the swirl runs, SET each item's velocity to the spiral
    // field (a reliable tornado regardless of packing; setting velocity also wakes
    // any sleeping body). When it's not running we leave the pile to world gravity +
    // auto-sleep — no per-body force, so settled items sleep and the pile doesn't
    // jitter on every pick.
    if (this._swirl > 0 && this._pile.size > 0) {
      const fan = this._config!.fan;
      // Ease the spiral in/out (smoothstep over `ramp`) so it doesn't snap.
      const intensity = this._swirlIntensity();
      const omega = fan.angularSpeed * fan.direction * intensity;
      const rise = fan.riseSpeed * intensity;
      // Blend the spiral target with each body's CURRENT velocity instead of
      // hard-setting it: this keeps a share of the solver's collision-separation
      // each frame, so packed items can't interpenetrate and then explode apart
      // when the fan releases. Lower = softer/smoother, higher = crisper spin.
      const b = fan.velocityBlend;
      const core = fan.coreRadius;
      // The swirl AXIS travels in a circle inside the pool so the tornado sweeps
      // toward each wall in turn (items get pushed against the walls and churn =
      // mixing). It eases out from / back to the pool centre with the ramp, so it
      // starts and ends centred.
      const elapsed = fan.duration - this._swirl;
      const ca = elapsed * fan.centerOrbitSpeed;
      const cx = Math.cos(ca) * fan.centerOrbitRadius * intensity;
      const cz = Math.sin(ca) * fan.centerOrbitRadius * intensity;
      for (const id of this._pile.keys()) {
        const t = this._physics!.getTransform(id, this._t);
        const dx = t.x - cx; // position relative to the moving swirl axis
        const dz = t.z - cz;
        const rr = Math.hypot(dx, dz);
        const r = rr || 1;
        // Outward unit (radial); for an item on the axis, pick a direction so it
        // still gets ejected instead of sitting there.
        let ux = dx / r;
        let uz = dz / r;
        if (rr < 1e-3) {
          ux = 1;
          uz = 0;
        }
        // Radial drift: push OUT of the central core (carves the vortex hollow,
        // strongest at the axis, fading to 0 at `coreRadius`), otherwise the
        // gentle inward gather. Net + = outward, − = inward.
        const out = rr < core ? fan.outwardSpeed * (1 - rr / core) : 0;
        const radial = (out - fan.inwardSpeed) * intensity;
        // Rigid rotation about the moving axis (v = ω × r) + radial + upward drift.
        const tvx = omega * dz + ux * radial;
        const tvz = -omega * dx + uz * radial;
        const v = this._physics!.getVelocity(id, this._v);
        this._physics!.setVelocity(id, v.x + (tvx - v.x) * b, v.y + (rise - v.y) * b, v.z + (tvz - v.z) * b);
      }
      this._swirl = Math.max(0, this._swirl - dt);
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
    this._pickLock.clear();
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
