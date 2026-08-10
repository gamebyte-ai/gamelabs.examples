import type { IInstanceResolver } from "@gamebyte/gamelabsjs";
import {
  Physics2DManager,
  Physics2DStage,
  type Body2DDef,
  type Physics2DEntity,
  type Physics2DEntityView,
  type Shape2D,
  type Transform2D,
  type Vec2,
} from "@gamebyte/gamelabsjs/physics2d";

import { MergeGameConfig } from "../MergeGameConfig.js";
import { BoardGeometry } from "./BoardGeometry.js";

/**
 * The render surface the domain drives — renderer-agnostic (game-space numbers +
 * the engine's `Physics2DEntityView`), so `MergeOperations` never imports PIXI
 * and stays unit-testable with a stub presenter + `FakePhysics2D`. The view
 * (`GameView`) implements it.
 */
export interface IMergePresenter {
  /** Make the flight graphic for a launched/merged item and return the adapter
   * the stage drives (game-space transforms in). `pop` scale-ups it on appear. */
  createEntity(kindIdx: number, pop: boolean): Physics2DEntityView;
  /** Load a new launcher item of `kindIdx` (pops it in) and enable aiming. */
  showLauncher(kindIdx: number): void;
  /** Consume the launcher item (hide it + the aim) after a launch. */
  hideLauncher(): void;
  /** Play the merge visual: two game-space points slide together + a burst. */
  playMerge(kindIdx: number, ax: number, ay: number, bx: number, by: number): void;
  /** Render the danger-line state: safe (normal), warn (blinking red), crossed
   * (solid red). `proximity` (0–1) is how close the nearest ball is in the warn
   * band (0 = far edge, 1 = at the line) — the view speeds the blink up with it. */
  setLineState(state: LineState, proximity: number): void;
  /** Show/hide the "FAIL" game-over banner (scales up + fades in when shown). */
  setGameOver(over: boolean): void;
  /** Set up the top goal row (one icon + count per goal), or clear it (empty array). */
  setGoals(goals: { tier: number; count: number }[]): void;
  /** A goal item (of `goalIndex`'s tier) was produced at game-space (gx,gy): fly it
   * up to the goal icon; on arrival show the new `remaining` count. */
  collectGoal(goalIndex: number, gx: number, gy: number, remaining: number): void;
  /** Show/hide the "AWESOME" + Play Again completion overlay. */
  setComplete(complete: boolean): void;
}

/** Danger-line render state. */
export type LineState = "safe" | "warn" | "crossed";

/** A launched item in play: its physics/view entity + which kind it is. `armed`
 * turns true once it has fully cleared the danger line (gone to the far side);
 * only then can it trigger the line — so a ball on its way UP from the launcher
 * (which spawns below the line) never falsely trips it. */
interface FlyingItem {
  entity: Physics2DEntity;
  kindIdx: number;
  armed: boolean;
}

/** A next-tier item scheduled to pop in once the merge slide has finished. */
interface PendingUpgrade {
  kindIdx: number;
  gx: number;
  gy: number;
  timer: number;
}

/** No-op view for invisible bodies (the game-space walls) — the trapezoid the
 * player sees is drawn by the view; these colliders never render. */
const WALL_VIEW: Physics2DEntityView = {
  setTransform(): void {},
  dispose(): void {},
};

/**
 * All Merge Game domain logic + state. Owns the physics world (through the
 * framework `Physics2DManager`/`Physics2DStage`, exactly like the other
 * physics-using example), the launched items, the merge chain, weighted spawn +
 * progressive unlock, and reload timing. Physics runs in a STRAIGHT-walled game
 * space (`BoardGeometry`); the view applies the perspective when rendering. Holds
 * no renderer — the view side is the injected `IMergePresenter`.
 */
export class MergeOperations {
  private _physics: Physics2DManager | null = null;
  private _config: MergeGameConfig | null = null;
  private _stage: Physics2DStage | null = null;
  private _geo: BoardGeometry | null = null;
  private _presenter: IMergePresenter | null = null;

  private readonly _items: FlyingItem[] = [];
  private readonly _pending: PendingUpgrade[] = [];
  private _walls: Physics2DEntity[] = [];

  private _currentKindIdx = 0; // the kind loaded in the launcher right now
  private _maxTier = 0; // highest tier produced so far → unlocks new launchable kinds
  private _ready = false; // an item is loaded and launchable
  private _reloadTimer = 0; // seconds until the next launcher item appears
  private _lastKind = -1; // last kind loaded into the launcher (for the anti-streak rule)
  private _lastKindStreak = 0; // how many times in a row it has loaded
  private _autoFireTimer = 0; // auto-fire accumulator (auto-fire levels)
  private _autoFireOn = false; // current level auto-fires
  private _fireKind: number | null = null; // current level forces this launched tier
  private _fireAll = false; // current level auto-fires a random tier among ALL kinds
  private _fireInterval = 0.25; // current level's auto-fire interval (seconds)

  // Danger line (game-space gy of the dashed line) + lose tracking.
  private _lineGy = 0;
  private _anyCrossed = false; // a ball is currently across the line (latest eval)
  private _graceUsed = false; // a grace shot has been fired while the line is crossed
  private _gameOver = false;
  private _gameOverTimer = 0;
  private _goals: { tier: number; remaining: number }[] = []; // per-level produce-N goals
  private _complete = false; // all goals met — level done

  private readonly _t: Transform2D = { x: 0, y: 0, angle: 0 };
  private readonly _v: Vec2 = { x: 0, y: 0 };

  public inject(resolver: IInstanceResolver): void {
    this._physics = resolver.getInstance(Physics2DManager);
    this._config = resolver.getInstance(MergeGameConfig);
    this._stage = new Physics2DStage(this._physics);
    this._geo = new BoardGeometry(this._config);
    // The danger line sits at the dashed line's design-y → its game-space gy.
    this._lineGy = this._geo.unproject(this._geo.centerX, this._config.dash.y).gy;
  }

  /** The controller wires the view's presenter in before the level is built. */
  public bindView(presenter: IMergePresenter): void {
    this._presenter = presenter;
  }

  //  LEVEL BUILD

  public buildLevel(): void {
    this._stage!.clear();
    this._items.length = 0;
    this._pending.length = 0;
    this._walls = [];
    this._anyCrossed = false;
    this._graceUsed = false;
    this._gameOver = false;
    this._gameOverTimer = 0;
    this._lastKind = -1;
    this._lastKindStreak = 0;
    this._autoFireTimer = 0;
    this._complete = false;
    this._goals.length = 0;

    this._buildWalls();
    this._spawnStartingLevel(); // also sets up the goal row
    this._presenter!.setLineState("safe", 0);
    this._presenter!.setGameOver(false);
    this._presenter!.setComplete(false);

    // Load the first launcher item (pops it in).
    this._currentKindIdx = this._pickKind();
    this._ready = true;
    this._reloadTimer = 0;
    this._presenter!.showLauncher(this._currentKindIdx);
  }

  /** Apply the starting level: unlock kinds up to its `maxTier` and pre-place its
   * balls (normalized 0–1 positions → game space). */
  private _spawnStartingLevel(): void {
    const cfg = this._config!;
    const geo = this._geo!;
    const levels = cfg.levels;
    const level = levels.defs[Math.max(0, Math.min(levels.defs.length - 1, levels.start - 1))];
    this._maxTier = level ? level.maxTier : 0;
    this._autoFireOn = level?.autoFire ?? false;
    this._fireKind = level?.fireKind ?? null;
    this._fireAll = level?.fireAll ?? false;
    this._fireInterval = level?.fireInterval ?? cfg.debug.autoFireInterval;
    // Goals: produce-N-of-a-tier objectives shown in the top row.
    const goals = level?.goals ?? [];
    this._goals = goals.map((g) => ({ tier: g.tier, remaining: g.count }));
    this._presenter!.setGoals(goals);
    if (!level) return;
    for (const b of level.balls) {
      if (b.kind < 0 || b.kind >= cfg.item.kinds.length) continue;
      this._spawnFlying(b.kind, b.x * geo.gW, b.y * geo.gH, 0, 0, false, true); // pre-placed → armed
    }
  }

  /** Four straight, static game-space walls around `[0, gW] × [0, gH]` so items
   * bounce linearly; the perspective is applied only when the view renders. */
  private _buildWalls(): void {
    const geo = this._geo!;
    const cfg = this._config!;
    const th = cfg.physics.wallThickness;
    const w = geo.gW;
    const h = geo.gH;
    const ceil = h * cfg.physics.topWall; // far (top) wall gy — may be lowered below the board top
    const wall = (cx: number, cy: number, ww: number, hh: number): void => {
      const def: Body2DDef = {
        shape: { kind: "rect", width: ww, height: hh },
        x: cx,
        y: cy,
        type: "static",
        restitution: cfg.physics.wall.restitution,
        friction: cfg.physics.wall.friction,
        tag: "wall",
      };
      this._walls.push(this._stage!.spawn(def, WALL_VIEW));
    };
    wall(-th / 2, h / 2, th, h + 2 * th); // left
    wall(w + th / 2, h / 2, th, h + 2 * th); // right
    wall(w / 2, -th / 2, w + 2 * th, th); // near (player) edge
    wall(w / 2, ceil + th / 2, w + 2 * th, th); // far edge (lowered by topWall)
  }

  //  LAUNCH

  /** Launch the current item from a game-space point toward the far edge. */
  public launch(gx: number, gy: number): void {
    if (!this._ready || this._gameOver || this._complete) return;
    const cfg = this._config!;

    // Firing while the line is crossed = the ONE grace shot. If it doesn't clear
    // the crossing, the reload step turns it into game over (no new item).
    if (this._anyCrossed) this._graceUsed = true;

    this._spawnFlying(this._currentKindIdx, gx, gy, 0, cfg.physics.launchSpeed, false, false); // launched → not armed yet

    this._ready = false;
    this._reloadTimer = cfg.launcher.reloadDelay;
    this._presenter!.hideLauncher();
  }

  private _triggerGameOver(): void {
    this._gameOver = true;
    this._gameOverTimer = this._config!.dangerLine.resetDelay;
    this._presenter!.setLineState("crossed", 1);
    this._presenter!.hideLauncher();
    this._presenter!.setGameOver(true);
  }

  //  PER-FRAME

  public update(dt: number): void {
    const d = Math.max(0, dt);

    // Game over: hold, then reset the level.
    if (this._gameOver) {
      this._gameOverTimer -= d;
      this._stage!.sync();
      if (this._gameOverTimer <= 0) this.reset();
      return;
    }

    // Level complete: freeze play (no reload/launch/merge) until "Play Again".
    // The view keeps animating the collect-flies + overlay via its own `tick`.
    if (this._complete) {
      this._stage!.sync();
      return;
    }

    this._advanceReload(d);
    this._autoFire(d);
    this._advancePending(d);
    if (!this._config!.debug.disableMerge) {
      this._applyAttraction(d);
      this._detectMerges();
    }
    this._lockSpin();
    this._evalDangerLine();
    this._stage!.sync();
  }

  /** Classify the danger line from the balls' near edges and push it to the view:
   * crossed (any past the line) > warn (any within `warnGap`) > safe. */
  private _evalDangerLine(): void {
    const dl = this._config!.dangerLine;
    let crossed = false;
    let warn = false;
    let prox = 0; // closest ball's proximity in the warn band (0 far → 1 at line)
    for (const item of this._items) {
      const t = this._physics!.getTransform(item.entity.id, this._t);
      const edge = t.y - this._itemHalf(item.kindIdx); // near edge (game-space gy)
      // Arm once it has cleared to the far side (lets a moving overflow count instantly).
      if (!item.armed && edge >= this._lineGy) item.armed = true;
      const v = this._physics!.getVelocity(item.entity.id, this._v);
      const settled = Math.hypot(v.x, v.y) <= dl.settleSpeed;
      // Ignore only balls that are BOTH fast AND not-yet-armed (a launch flying up
      // through the line). Anything armed OR at rest is judged against the line.
      if (!item.armed && !settled) continue;
      // CROSSED: any part of the ball is on or past the line (near edge ≤ line) → solid.
      if (edge <= this._lineGy) {
        crossed = true;
      } else if (settled && edge < this._lineGy + dl.warnGap) {
        // WARN (blink) only for settled balls approaching within the band.
        warn = true;
        prox = Math.max(prox, 1 - (edge - this._lineGy) / dl.warnGap);
      }
    }
    this._anyCrossed = crossed;
    this._presenter!.setLineState(crossed ? "crossed" : warn ? "warn" : "safe", crossed ? 1 : prox);
  }

  /** Emulate a rotation lock (the framework body has no `setInertia(Infinity)`):
   * when `spin` is off, zero every item's angular velocity each frame so squares
   * keep their orientation instead of tumbling into a round-looking blur. */
  private _lockSpin(): void {
    if (this._config!.physics.spin) return;
    for (const item of this._items) this._physics!.setAngularVelocity(item.entity.id, 0);
  }

  /** Magnetic pull: while two same-kind items are in the attract band (surface gap
   * in `(gap, attractGap]`), gently ease each toward its nearest same-kind partner
   * so they drift together until the merge band takes over. Velocity-based so the
   * drift speed is directly tunable; eased so it never snaps. */
  private _applyAttraction(dt: number): void {
    const m = this._config!.merge;
    if (m.attractGap <= m.gap || m.attractSpeed <= 0) return;
    const k = 1 - Math.exp(-m.attractSmoothing * dt);
    for (let i = 0; i < this._items.length; i++) {
      const a = this._items[i];
      const pa = this._physics!.getTransform(a.entity.id, this._t);
      const ax = pa.x;
      const ay = pa.y;
      const aAngle = pa.angle;
      // Nearest same-kind partner inside the attract band (shape/rotation-aware gap).
      let bestD = Infinity;
      let tx = 0;
      let ty = 0;
      for (let j = 0; j < this._items.length; j++) {
        if (j === i) continue;
        const b = this._items[j];
        if (b.kindIdx !== a.kindIdx) continue;
        const pb = this._physics!.getTransform(b.entity.id, this._t);
        const bx = pb.x;
        const by = pb.y;
        const gap = this._pairGap(a.kindIdx, aAngle, ax, ay, b.kindIdx, pb.angle, bx, by);
        if (gap <= m.gap || gap > m.attractGap) continue;
        const d = Math.hypot(bx - ax, by - ay);
        if (d < bestD && !this._isBlocked(a, b, ax, ay, bx, by)) {
          bestD = d;
          tx = bx;
          ty = by;
        }
      }
      if (bestD === Infinity) continue;
      const dx = tx - ax;
      const dy = ty - ay;
      const d = Math.hypot(dx, dy) || 1;
      const cur = this._physics!.getVelocity(a.entity.id, this._v);
      const tvx = (dx / d) * m.attractSpeed;
      const tvy = (dy / d) * m.attractSpeed;
      this._physics!.setVelocity(a.entity.id, cur.x + (tvx - cur.x) * k, cur.y + (tvy - cur.y) * k);
      // Pull it AS-IS: suppress spin during the magnetic drift so it glides without
      // an unnatural rotation kicking in.
      this._physics!.setAngularVelocity(a.entity.id, 0);
    }
  }

  /** After a launch, count down and pop a fresh (weighted) item into the launcher. */
  private _advanceReload(dt: number): void {
    if (this._ready || this._reloadTimer <= 0) return;
    this._reloadTimer -= dt;
    if (this._reloadTimer > 0) return;
    // The grace shot has resolved. Still crossed? → game over, and DON'T reload a
    // new item. Otherwise load the next item and refresh the grace.
    if (this._graceUsed && this._anyCrossed) {
      this._triggerGameOver();
      return;
    }
    this._graceUsed = false;
    this._currentKindIdx = this._pickKind();
    this._ready = true;
    this._presenter!.showLauncher(this._currentKindIdx);
  }

  /** Debug: while `autoFire` is on, keep launching at a random X as fast as
   * `autoFireInterval` allows (a stress test). */
  private _autoFire(dt: number): void {
    const cfg = this._config!;
    if (!this._autoFireOn || !this._ready) return;
    this._autoFireTimer += dt;
    if (this._autoFireTimer < this._fireInterval) return;
    this._autoFireTimer = 0;
    const geo = this._geo!;
    const gx = Math.random() * geo.gW; // launch() clamps it inside the walls
    const gy = geo.unproject(geo.centerX, cfg.launcher.y).gy;
    this.launch(gx, gy);
  }

  /** Spawn each upgraded item once its merge slide has finished. */
  private _advancePending(dt: number): void {
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const p = this._pending[i];
      p.timer -= dt;
      if (p.timer > 0) continue;
      this._pending.splice(i, 1);
      if (p.kindIdx > this._maxTier) this._maxTier = p.kindIdx; // unlock new launchable kinds
      // Merge products are ARMED at birth — they count for the line immediately,
      // even when produced below it (they didn't launch up from the launcher). The
      // real item ALWAYS stays on the board (it never leaves the play area).
      this._spawnFlying(p.kindIdx, p.gx, p.gy, 0, 0, true, true);
      // If it satisfies a still-open goal, fly a SILHOUETTE up to the goal icon
      // (pure feedback — the real item above stays in play) and drop the count.
      const gi = this._goalIndexFor(p.kindIdx);
      if (gi >= 0) {
        const goal = this._goals[gi];
        goal.remaining--;
        this._presenter!.collectGoal(gi, p.gx, p.gy, goal.remaining);
        if (this._goals.every((g) => g.remaining <= 0)) this._completeLevel();
      }
    }
  }

  /** Index of the first still-open goal matching `tier`, or -1 if none. */
  private _goalIndexFor(tier: number): number {
    return this._goals.findIndex((g) => g.tier === tier && g.remaining > 0);
  }

  /** All goals met → freeze play and show the completion overlay. */
  private _completeLevel(): void {
    this._complete = true;
    this._ready = false;
    this._presenter!.hideLauncher();
    this._presenter!.setComplete(true);
  }

  /** Proximity merge: two same-kind items whose SURFACES come within `merge.gap`
   * (game-space, edge-to-edge so it works at any size) merge into the next tier. */
  private _detectMerges(): void {
    const cfg = this._config!;
    const merged = new Set<Physics2DEntity>();
    const pairs: { a: FlyingItem; b: FlyingItem }[] = [];
    for (let i = 0; i < this._items.length; i++) {
      const a = this._items[i];
      if (merged.has(a.entity)) continue;
      const pa = this._physics!.getTransform(a.entity.id, this._t);
      const ax = pa.x;
      const ay = pa.y;
      const aAngle = pa.angle;
      for (let j = i + 1; j < this._items.length; j++) {
        const b = this._items[j];
        if (merged.has(b.entity) || b.kindIdx !== a.kindIdx) continue;
        const pb = this._physics!.getTransform(b.entity.id, this._t);
        const bx = pb.x;
        const by = pb.y;
        const surfaceGap = this._pairGap(a.kindIdx, aAngle, ax, ay, b.kindIdx, pb.angle, bx, by);
        if (surfaceGap <= cfg.merge.gap && !this._isBlocked(a, b, ax, ay, bx, by)) {
          pairs.push({ a, b });
          merged.add(a.entity);
          merged.add(b.entity);
          break; // a is now merging; move to the next a
        }
      }
    }
    for (const { a, b } of pairs) this._merge(a, b);
  }

  /** Merge two same-kind items: remove both bodies, hand the slide+burst to the
   * view, and schedule the next-tier item to pop in at their midpoint. */
  private _merge(a: FlyingItem, b: FlyingItem): void {
    const cfg = this._config!;
    const pa = this._physics!.getTransform(a.entity.id, this._t);
    const ax = pa.x;
    const ay = pa.y;
    const pb = this._physics!.getTransform(b.entity.id, this._t);
    const bx = pb.x;
    const by = pb.y;

    this._despawn(a);
    this._despawn(b);
    this._presenter!.playMerge(a.kindIdx, ax, ay, bx, by);

    const nextKind = a.kindIdx + 1;
    if (nextKind < cfg.item.kinds.length) {
      const timer = Math.max(cfg.merge.pullTime, cfg.merge.shrinkTime);
      this._pending.push({ kindIdx: nextKind, gx: (ax + bx) / 2, gy: (ay + by) / 2, timer });
    }
  }

  //  RESET / CLEANUP

  public reset(): void {
    this.buildLevel();
  }

  public destroy(): void {
    this._stage?.clear();
    this._items.length = 0;
    this._pending.length = 0;
    this._walls = [];
    this._physics = null;
    this._config = null;
    this._stage = null;
    this._geo = null;
    this._presenter = null;
  }

  //  HELPERS

  /** Create a flying item (body + view) at a game-space point with a velocity,
   * clamped fully inside the walls so the engine never has to push it out. */
  private _spawnFlying(kindIdx: number, gx: number, gy: number, vx: number, vy: number, pop: boolean, armed: boolean): void {
    const cfg = this._config!;
    const geo = this._geo!;
    const kind = cfg.item.kinds[kindIdx];
    // Collider half-size = visual half-size × colliderScale (1 = exactly the item).
    const half = this._itemHalf(kindIdx) * cfg.physics.colliderScale;
    const ceil = geo.gH * cfg.physics.topWall; // keep spawns below the (possibly lowered) far wall
    const cx = Math.max(half + 1, Math.min(geo.gW - half - 1, gx));
    const cy = Math.max(half + 1, Math.min(ceil - half - 1, gy));
    // Per-kind physics — each item's own values.
    const def: Body2DDef = {
      shape: this._shapeFor(kind.shape, half),
      x: cx,
      y: cy,
      type: "dynamic",
      restitution: kind.restitution,
      friction: kind.friction,
      frictionAir: kind.frictionAir,
      tag: "item",
    };
    if (kind.density !== undefined) def.density = kind.density;
    const entity = this._stage!.spawn(def, this._presenter!.createEntity(kindIdx, pop));
    this._physics!.setVelocity(entity.id, vx, vy);
    this._items.push({ entity, kindIdx, armed });
  }

  private _despawn(item: FlyingItem): void {
    item.entity.despawn();
    const idx = this._items.indexOf(item);
    if (idx >= 0) this._items.splice(idx, 1);
  }

  /** Collider shape for a kind (game-space). Only circle and rect are used — the
   * framework body has no chamfer, so the square collider is a plain rect (the
   * visual keeps its rounded corners). */
  private _shapeFor(shape: MergeGameConfig["item"]["kinds"][number]["shape"], half: number): Shape2D {
    return shape === "square" ? { kind: "rect", width: 2 * half, height: 2 * half } : { kind: "circle", radius: half };
  }

  /** Effective half-size of a kind = radius × global item.scale × the kind's scale. */
  private _itemHalf(kindIdx: number): number {
    const cfg = this._config!;
    const k = cfg.item.kinds[kindIdx];
    return cfg.item.radius * cfg.item.scale * (k ? k.scale : 1);
  }

  /** Collider reach (center → boundary) along a WORLD unit direction. Circles are
   * uniform; a rotated square's reach grows toward its corners (`half / max(|lx|,
   * |ly|)` in its local frame), so corner contacts register like face contacts. */
  private _reach(kindIdx: number, angle: number, ux: number, uy: number): number {
    const half = this._itemHalf(kindIdx) * this._config!.physics.colliderScale;
    if (this._config!.item.kinds[kindIdx].shape !== "square") return half;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const lx = ux * c + uy * s; // world dir rotated into the box's local frame
    const ly = -ux * s + uy * c;
    const mmax = Math.max(Math.abs(lx), Math.abs(ly));
    return mmax > 1e-6 ? half / mmax : half;
  }

  /** Is another item straddling the line between A and B? Used to forbid merging /
   * attracting THROUGH a different item that sits between the pair (each blocker
   * approximated as a circle of its half-size). */
  private _isBlocked(a: FlyingItem, b: FlyingItem, ax: number, ay: number, bx: number, by: number): boolean {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 < 1e-6) return false;
    for (const c of this._items) {
      if (c === a || c === b) continue;
      const pc = this._physics!.getTransform(c.entity.id, this._t);
      const t = ((pc.x - ax) * abx + (pc.y - ay) * aby) / len2;
      if (t <= 0.05 || t >= 0.95) continue; // not between the pair
      const px = ax + abx * t;
      const py = ay + aby * t;
      if (Math.hypot(pc.x - px, pc.y - py) < this._itemHalf(c.kindIdx)) return true;
    }
    return false;
  }

  /** Edge-to-edge surface gap between two items along the line joining them,
   * shape- and rotation-aware (so square corners are measured correctly). */
  private _pairGap(aKind: number, aAngle: number, ax: number, ay: number, bKind: number, bAngle: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return -(this._reach(aKind, aAngle, 1, 0) + this._reach(bKind, bAngle, -1, 0));
    const ux = dx / dist;
    const uy = dy / dist;
    return dist - (this._reach(aKind, aAngle, ux, uy) + this._reach(bKind, bAngle, -ux, -uy));
  }

  /** Effective launch weight: the kind's `weight`, but only once it's unlocked
   * (and, in debug, only if it matches `onlyShape`). */
  private _launchWeight(kindIdx: number): number {
    const cfg = this._config!;
    const k = cfg.item.kinds[kindIdx];
    if (!k) return 0;
    if (k.unlockAtMax > this._maxTier) return 0;
    if (kindIdx > cfg.item.maxSpawnTier) return 0; // higher tiers only come from merges
    if (cfg.debug.onlyShape && k.shape !== cfg.debug.onlyShape) return 0;
    return Math.max(0, k.weight);
  }

  /** Pick the next launcher kind (weighted), but forbid a 4th (config
   * `maxSameStreak`+1) identical load in a row — after the cap, exclude the last
   * kind so the next one differs. Tracks the run length. */
  private _pickKind(): number {
    if (this._fireAll) return Math.floor(Math.random() * this._config!.item.kinds.length); // test: any tier
    if (this._fireKind !== null) return this._fireKind; // auto-fire / test levels force one tier
    const blocked = this._lastKindStreak >= this._config!.item.maxSameStreak ? this._lastKind : -1;
    let pick = this._weightedPick(blocked);
    if (pick < 0) pick = this._weightedPick(-1); // excluding it left nothing → allow it
    if (pick < 0) pick = 0;
    if (pick === this._lastKind) {
      this._lastKindStreak++;
    } else {
      this._lastKind = pick;
      this._lastKindStreak = 1;
    }
    return pick;
  }

  /** Weighted-random among currently-unlocked launchable kinds, optionally
   * excluding one index. Returns -1 if nothing is eligible. */
  private _weightedPick(exclude: number): number {
    const kinds = this._config!.item.kinds;
    let total = 0;
    for (let i = 0; i < kinds.length; i++) if (i !== exclude) total += this._launchWeight(i);
    if (total <= 0) return -1;
    let r = Math.random() * total;
    for (let i = 0; i < kinds.length; i++) {
      if (i === exclude) continue;
      r -= this._launchWeight(i);
      if (r < 0) return i;
    }
    return -1;
  }
}
