import * as THREE from "three";
import gsap from "gsap";
import type { GridObject, IInstanceResolver, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridsView, ParticleBudget, type GridCellObject } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import type { GemPosition, IGameBoardsView } from "./IGameBoardsView.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";
import { GemPopEmitter } from "./GemPopEmitter.three.js";

export class GameBoardsView extends GridsView implements IGameBoardsView {
  /** The board's own panel. Below the outline so an opaque panel cannot cover it. */
  private static readonly BACKDROP_Y = 0.015;
  /** Drawn over the panel, under the gem shadows (`0.045`). */
  private static readonly OUTLINE_Y = 0.02;
  /** Squared distance under which a gem counts as sitting in its cell. */
  private static readonly AT_REST_EPSILON = 1e-6;

  private _cellPointerDownHandler: ((gridId: number, col: number, row: number, event: PointerEvent) => void) | null = null;
  private _config: Match3Config | null = null;
  private _outline: THREE.Mesh | null = null;
  private _backdrop: THREE.Mesh | null = null;
  /** Gems in flight, keyed by item id — the id survives the grid rebuilding objects. */
  private readonly _falls = new Map<number, { height: number; speed: number }>();
  /**
   * Cosmetic landing dips, keyed by item id. Separate from {@link _falls} on purpose:
   * a gem here has already ARRIVED as far as the board is concerned, so a match or a
   * stripe in its column includes it without waiting for the dip to finish.
   */
  private readonly _bounces = new Map<number, { elapsed: number }>();
  private _landingWatchers: { items: number[]; resolve: () => void }[] = [];
  private _popEmitter: GemPopEmitter | null = null;
  /**
   * Gems inside a swap tween. Their local offset is LATERAL, not height, so the fall
   * integrator must leave them alone — it reads any offset as distance still to drop
   * and would pull a swapping gem onto the vertical axis, landing it somewhere it was
   * never meant to be.
   */
  private readonly _swapping = new Set<number>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(Match3Config);

    // The module hands views the shared `ParticleBudget` but keeps `ParticleManager` on
    // the app container — views build emitters, the app registers them. So this only
    // constructs and parents the emitter; `Match3App` picks it up via `popEmitter`.
    const fx = this._config.popParticles;
    if (fx.count > 0) {
      const budget = resolver.getInstance(ParticleBudget);
      this._popEmitter = new GemPopEmitter(budget, fx.budget, fx.speed, fx.size * this._config.gridColumnSize);
      this.add(this._popEmitter);
    }
  }

  /** The board's pop emitter, for the app to register with the particle manager. */
  public get popEmitter(): GemPopEmitter | null {
    return this._popEmitter;
  }

  public override postInitialize(): void {
    super.postInitialize();
    this._createBoardBackdrop();
    this._createBoardOutline();
  }

  /**
   * The board's own panel, filling the grid so it reads as a surface distinct from
   * the scene backdrop without drawing anything per cell. Sits under the outline and
   * the gems; opaque unless the configured opacity says otherwise.
   */
  private _createBoardBackdrop(): void {
    const cfg = this._config;
    if (!cfg || this._backdrop) return;
    // Opacity 0 means "no panel at all" rather than an invisible mesh in the scene.
    if (cfg.boardBackgroundOpacity <= 0) return;

    const { width, depth } = this._boardExtents(cfg);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({
        color: cfg.boardBackgroundColor,
        // Only pay for blending when it is actually translucent; a solid panel goes
        // through the opaque path and sorts normally.
        transparent: cfg.boardBackgroundOpacity < 1,
        opacity: cfg.boardBackgroundOpacity,
        // The panel is behind the gems and must never occlude them.
        depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = GameBoardsView.BACKDROP_Y;
    this.add(mesh);
    this._backdrop = mesh;
  }

  /** Outer size of the board including the outline padding, in world units. */
  private _boardExtents(cfg: Match3Config): { width: number; depth: number } {
    return { width: cfg.boardWidth, depth: cfg.boardDepth };
  }

  /**
   * A single frame around the whole grid, replacing the per-cell planes.
   * Built as one flat ring mesh (outer rect + inner rect hole) rather than
   * `LineSegments`, because WebGL ignores `linewidth` — a mesh is the only way
   * to get a controllable stroke width.
   *
   * The grid recenters its cell layout on the origin (see `Match3App`), and this
   * view sits at the origin too, so a centered frame lines up with the cells.
   */
  private _createBoardOutline(): void {
    const cfg = this._config;
    if (!cfg || this._outline) return;

    const { width: w, depth: d } = this._boardExtents(cfg);
    const t = cfg.boardOutlineThickness;
    const hw = w * 0.5;
    const hd = d * 0.5;

    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

    // Wound opposite to the outer contour so it cuts a hole instead of filling.
    const hole = new THREE.Path();
    hole.moveTo(-hw + t, -hd + t);
    hole.lineTo(-hw + t, hd - t);
    hole.lineTo(hw - t, hd - t);
    hole.lineTo(hw - t, -hd + t);
    hole.closePath();
    shape.holes.push(hole);

    // MeshBasic: a flat outline should not react to scene lighting.
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: cfg.boardOutlineColor, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2; // shape XY → world XZ (top-down board plane)
    mesh.position.y = GameBoardsView.OUTLINE_Y;
    this.add(mesh);
    this._outline = mesh;
  }

  public setCellPointerDownHandler(handler: ((gridId: number, col: number, row: number, event: PointerEvent) => void) | null): void {
    this._cellPointerDownHandler = handler;
  }

  public override onGridCellPointerDown(gridId: number, col: number, row: number, event: PointerEvent): void {
    this._cellPointerDownHandler?.(gridId, col, row, event);
  }

  public updateGemSelection(gridId: number, selected: { col: number; row: number } | null): void {
    const go = this.getGridObject(gridId);
    if (!go) return;
    for (let c = 0; c < go.columnCount; c++) {
      for (let r = 0; r < go.rowCount; r++) {
        const item = go.getCell(c, r)?.item;
        if (item instanceof GameBoardItemObject) item.setHighlighted(selected !== null && selected.col === c && selected.row === r);
      }
    }
  }

  public animateInvalidSwap(gridId: number, r1: number, c1: number, r2: number, c2: number): Promise<void> {
    const cfg = this._config;
    const pair = this._swapPair(gridId, r1, c1, r2, c2);
    if (!cfg || !pair) return Promise.resolve();
    const { gem1, gem2, cell1, cell2, go } = pair;
    const t1 = this._localTowardCell(go, cell1, c2, r2);
    const t2 = this._localTowardCell(go, cell2, c1, r1);
    const half = cfg.animInvalidSwapSec * 0.5;
    return new Promise((resolve) => {
      // The bounce is two legs — out, then back. If a concurrent chain kills the
      // timeline after the first leg the gem would be stranded beside its cell, so
      // interruption snaps both gems home just like completion does.
      this._swapping.add(gem1.itemId).add(gem2.itemId);
      const home = (): void => {
        this._swapping.delete(gem1.itemId);
        this._swapping.delete(gem2.itemId);
        gem1.position.set(0, 0, 0);
        gem2.position.set(0, 0, 0);
        resolve();
      };
      const tl = gsap.timeline({ onComplete: home, onInterrupt: home });
      tl.to(gem1.position, { x: t1.x, y: t1.y, z: t1.z, duration: half, ease: "power2.inOut", overwrite: true }, 0);
      tl.to(gem2.position, { x: t2.x, y: t2.y, z: t2.z, duration: half, ease: "power2.inOut", overwrite: true }, 0);
      tl.to(gem1.position, { x: 0, y: 0, z: 0, duration: half, ease: "power2.inOut" });
      tl.to(gem2.position, { x: 0, y: 0, z: 0, duration: half, ease: "power2.inOut" }, "<");
    });
  }

  public animateValidSwap(gridId: number, r1: number, c1: number, r2: number, c2: number): Promise<void> {
    const cfg = this._config;
    const pair = this._swapPair(gridId, r1, c1, r2, c2);
    if (!cfg || !pair) return Promise.resolve();
    const { gem1, gem2, cell1, cell2, go } = pair;
    const t1 = this._localTowardCell(go, cell1, c2, r2);
    const t2 = this._localTowardCell(go, cell2, c1, r1);
    const dur = cfg.animSwapSec;
    return new Promise((resolve) => {
      let left = 2;
      this._swapping.add(gem1.itemId).add(gem2.itemId);
      // The model applies the swap once this resolves, so an interrupted tween must
      // still settle and report — otherwise the swap would never be committed.
      const done = (): void => {
        left--;
        if (left > 0) return;
        this._swapping.delete(gem1.itemId);
        this._swapping.delete(gem2.itemId);
        resolve();
      };
      gsap.to(gem1.position, { x: t1.x, y: t1.y, z: t1.z, duration: dur, ease: "power2.inOut", overwrite: true, onComplete: done, onInterrupt: done });
      gsap.to(gem2.position, { x: t2.x, y: t2.y, z: t2.z, duration: dur, ease: "power2.inOut", overwrite: true, onComplete: done, onInterrupt: done });
    });
  }

  /**
   * Pops the matched gems.
   *
   * The gem being cleared is left exactly where it is — the model clears the cell a
   * moment later and the grid disposes of the object itself. What animates is a
   * throwaway CLONE parented to this view at the same world position.
   *
   * Taking the real object out of its cell (`takeItem`) is what this replaces: it
   * broke the grid's cell-to-object bookkeeping, so a later `destroyItem` could find
   * an id it did not expect, bail out, and leave the object in the scene while a new
   * one was added to the same cell — two gems in one cell, one of them frozen.
   *
   * The clone shares geometry and materials with the original, so it is only detached
   * when the tween ends; disposing it would take the original's resources with it.
   */
  public animateClearMatches(gridId: number, matches: { row: number; col: number; wave?: number }[]): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || matches.length === 0) return Promise.resolve();
    const total = cfg.animPopSec;
    // 0 means no pop visual at all — the gems just vanish with the model. Skipping the
    // ghost entirely (rather than tweening it for 0s) keeps the board clean while the
    // fall is under test.
    if (total <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      let n = matches.length;
      const doneOne = (): void => {
        n--;
        if (n <= 0) resolve();
      };
      const world = new THREE.Vector3();
      for (const { row, col, wave } of matches) {
        const gem = this._getGem(go, col, row);
        if (!gem) {
          doneOne();
          continue;
        }
        const ghost = this._buildPopGhost(gem);
        // The CELL's position, not the gem's. The model treats a gem as arrived the
        // moment it is assigned a cell, but the gem may still be visually descending
        // from the reserve — popping at its current position played the burst high
        // above the board, outside the play area entirely.
        const cell = go.getCell(col, row);
        (cell ?? gem).getWorldPosition(world);
        this.add(ghost);
        ghost.position.copy(this.worldToLocal(world.clone()));
        ghost.scale.copy(gem.scale);

        this._popEmitter?.burst(ghost.position, Match3Config.GEM_PALETTE[gem.gemType % Match3Config.GEM_PALETTE.length], cfg.popParticles.count);

        const end = (): void => {
          ghost.removeFromParent();
          doneOne();
        };
        // Straight to shrinking — no scale-up overshoot first. Effects will layer on
        // top of this later, so the pop itself stays a plain uniform shrink.
        gsap.to(ghost.scale, {
          x: 0.02,
          y: 0.02,
          z: 0.02,
          // Cells further along a sweep start later, so the line clears outward from
          // the gem that fired it rather than vanishing in one go.
          delay: (wave ?? 0) * cfg.special.sweepStepSec,
          duration: total,
          ease: cfg.animPopEase,
          overwrite: true,
          onComplete: end,
          onInterrupt: end
        });
      }
    });
  }

  /**
   * Where each gem in `cols` is right now, in world space, keyed by item id.
   *
   * Must be read BEFORE the model moves anything. The grid destroys a gem's object
   * and builds a new one whenever the item changes cell, so afterwards there is no
   * record of where the gem was rendering — and the item id is the only thing that
   * survives the rebuild.
   */
  public captureGemPositions(gridId: number, cols: ReadonlySet<number>): Map<number, GemPosition> {
    const out = new Map<number, GemPosition>();
    const go = this.getGridObject(gridId);
    if (!go) return out;

    const world = new THREE.Vector3();
    for (const col of cols) {
      for (let row = 0; row < go.rowCount; row++) {
        const gem = this._getGem(go, col, row);
        if (!gem) continue;
        // A gem mid-bounce has already arrived; its dip is decoration. Recording the
        // dipped position would make the next pass read it as height still to fall and
        // relaunch it, which spreads bounces to cells that never moved.
        const settled = this._bounces.has(gem.itemId) || this._swapping.has(gem.itemId);
        const source = settled ? (go.getCell(col, row) ?? gem) : gem;
        source.getWorldPosition(world);
        out.set(gem.itemId, { x: world.x, y: world.y, z: world.z });
      }
    }
    return out;
  }

  /**
   * Retargets every gem in `cols` onto the cell it now occupies, WITHOUT restarting
   * its motion. A gem already falling keeps its speed and simply gets a new, lower
   * target; only a gem at rest starts from scratch.
   *
   * Nothing is tweened. A tween cannot express "carry on at your current speed" — a
   * fresh one always starts from zero velocity, so a gem in mid-fall visibly slowed
   * and re-accelerated every time another match landed. The motion is integrated per
   * frame instead (see {@link stepFalls}), which makes retargeting free.
   */
  public reconcileColumns(gridId: number, cols: ReadonlySet<number>, captured: Map<number, GemPosition>): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go) return Promise.resolve();
    const preset = go.preset as RectGridPreset;
    const cellStep = Math.min(preset.columnSize, preset.rowSize);
    const up = this._negRowAxisOffset(go, 1).normalize();

    const watched: number[] = [];
    for (const col of cols) {
      let fresh = 0;
      for (let row = 0; row < go.rowCount; row++) {
        const gem = this._getGem(go, col, row);
        if (gem && !captured.has(gem.itemId)) fresh++;
      }

      for (let row = 0; row < go.rowCount; row++) {
        const gem = this._getGem(go, col, row);
        if (!gem) continue;

        // Already landed and just playing its dip: leave it be. Resetting its position
        // every pass would fight the bounce and show up as a stutter.
        if (this._swapping.has(gem.itemId)) continue;
        if (this._bounces.has(gem.itemId) && !this._falls.has(gem.itemId)) continue;

        const was = captured.get(gem.itemId);
        if (was) {
          // Place the rebuilt object exactly where the old one was rendering.
          gem.position.copy(gem.parent!.worldToLocal(new THREE.Vector3(was.x, was.y, was.z)));
        } else {
          gem.position.copy(up.clone().multiplyScalar(fresh * cellStep));
        }

        const height = gem.position.length();
        if (height < GameBoardsView.AT_REST_EPSILON) {
          gem.position.set(0, 0, 0);
          this._falls.delete(gem.itemId);
          continue;
        }

        // Speed carries over untouched — that is the whole point. A gem that was not
        // already moving starts at rest.
        const existing = this._falls.get(gem.itemId);
        this._falls.set(gem.itemId, { height, speed: existing?.speed ?? 0 });
        // It is falling again, so whatever dip it was playing is over.
        this._bounces.delete(gem.itemId);
        watched.push(gem.itemId);
      }
    }

    if (watched.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this._landingWatchers.push({ items: watched, resolve });
    });
  }

  /**
   * Advances every gem in flight by one frame under `fallAccelCellsPerSec2`.
   *
   * Each gem carries its own speed, so columns run independently: a match in one
   * cannot stall another, and there is no board-wide sync point in a cascade.
   */
  public stepFalls(dtSeconds: number): void {
    const cfg = this._config;
    const go = this.getGridObject(Match3Config.GRID_ID);
    if (!cfg || !go || (this._falls.size === 0 && this._bounces.size === 0)) return;

    const preset = go.preset as RectGridPreset;
    const cellStep = Math.min(preset.columnSize, preset.rowSize);
    const accel = cfg.fallAccelCellsPerSec2 * cellStep;
    const up = this._negRowAxisOffset(go, 1).normalize();
    const byId = this._gemsById(go);

    for (const [itemId, fall] of [...this._falls]) {
      const gem = byId.get(itemId);
      if (!gem) {
        this._falls.delete(itemId);
        continue;
      }

      fall.speed += accel * dtSeconds;
      fall.height -= fall.speed * dtSeconds;

      if (fall.height > 0) {
        gem.position.copy(up.clone().multiplyScalar(fall.height));
        continue;
      }

      // First touch IS the arrival: leaving `_falls` here is what releases the gem to
      // matching straight away. The dip below plays on and holds nothing up.
      gem.position.set(0, 0, 0);
      this._falls.delete(itemId);
      if (cfg.fallBounce.cells > 0 && cfg.fallBounce.sec > 0) this._bounces.set(itemId, { elapsed: 0 });
    }

    this._enforceStack(go, up);
    this._stepBounces(dtSeconds, byId, up, cellStep, cfg);
    this._resolveLandings();
  }

  /**
   * The landing dip: a half sine carrying the gem a fixed distance PAST its cell and
   * back. Fixed duration too, so every landing reads the same however far it fell.
   */
  private _stepBounces(
    dtSeconds: number,
    byId: Map<number, GameBoardItemObject>,
    up: THREE.Vector3,
    cellStep: number,
    cfg: Match3Config
  ): void {
    if (this._bounces.size === 0) return;
    const depth = cfg.fallBounce.cells * cellStep;
    const total = cfg.fallBounce.sec;

    for (const [itemId, bounce] of [...this._bounces]) {
      const gem = byId.get(itemId);
      if (!gem || this._falls.has(itemId)) {
        this._bounces.delete(itemId);
        continue;
      }

      bounce.elapsed += dtSeconds;
      if (bounce.elapsed >= total) {
        gem.position.set(0, 0, 0);
        this._bounces.delete(itemId);
        continue;
      }

      // Negated `up` puts the dip on the far side of the cell.
      gem.position.copy(up.clone().multiplyScalar(-depth * Math.sin((Math.PI * bounce.elapsed) / total)));
    }
  }

  /**
   * Keeps each column a solid stack: no gem may overtake the one beneath it.
   *
   * Gems integrate their own speed, and in a cascade an upper gem often starts falling
   * before a lower one — so it is moving faster, closes the gap and passes straight
   * through. Targets alone cannot prevent that; the column needs a constraint.
   *
   * In cell-local terms it reduces to one comparison. A gem's `height` is how far it
   * still is above its own cell, and consecutive cells are one step apart, so "stay
   * above the gem below" is exactly `height >= heightOfGemBelow`. Anything caught by
   * that has effectively landed on its neighbour, so it also inherits its speed
   * instead of continuing to accelerate into it.
   *
   * Runs every frame, bottom-up, which is what makes the stack hold while targets keep
   * changing underneath it.
   */
  private _enforceStack(go: GridObject, up: THREE.Vector3): void {
    for (let col = 0; col < go.columnCount; col++) {
      let belowHeight = 0;
      let belowSpeed = 0;

      for (let row = go.rowCount - 1; row >= 0; row--) {
        const gem = this._getGem(go, col, row);
        if (!gem) continue;

        const fall = this._falls.get(gem.itemId);
        if (!fall) {
          // At rest (or only bouncing): it is the floor for whatever is above it.
          belowHeight = 0;
          belowSpeed = 0;
          continue;
        }

        if (fall.height < belowHeight) {
          fall.height = belowHeight;
          fall.speed = Math.min(fall.speed, belowSpeed);
          gem.position.copy(up.clone().multiplyScalar(fall.height));
        }

        belowHeight = fall.height;
        belowSpeed = fall.speed;
      }
    }
  }

  private _gemsById(go: GridObject): Map<number, GameBoardItemObject> {
    const out = new Map<number, GameBoardItemObject>();
    for (let col = 0; col < go.columnCount; col++) {
      for (let row = 0; row < go.rowCount; row++) {
        const gem = this._getGem(go, col, row);
        if (gem) out.set(gem.itemId, gem);
      }
    }
    return out;
  }

  /** A waiting caller is released once none of the gems it asked about are moving. */
  private _resolveLandings(): void {
    if (this._landingWatchers.length === 0) return;
    this._landingWatchers = this._landingWatchers.filter((w) => {
      if (w.items.some((id) => this._falls.has(id))) return true;
      w.resolve();
      return false;
    });
  }

  /**
   * A throwaway stand-in for a gem that is about to be cleared, built from plain
   * meshes that reuse the gem's geometry and materials.
   *
   * Not `gem.clone()`: three.js clones by calling `new this.constructor()` with no
   * arguments, and these objects need their options, so cloning throws before the pop
   * ever starts. Invisible children (the selection halo) are skipped, and nothing here
   * is ever disposed — the resources belong to the real gem.
   */
  private _buildPopGhost(gem: GameBoardItemObject): THREE.Object3D {
    const ghost = new THREE.Group();
    gem.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.visible) return;
      const copy = new THREE.Mesh(node.geometry, node.material);
      copy.position.copy(node.position);
      copy.rotation.copy(node.rotation);
      copy.scale.copy(node.scale);
      copy.renderOrder = node.renderOrder;
      ghost.add(copy);
    });
    return ghost;
  }

  private _getGem(go: GridObject, col: number, row: number): GameBoardItemObject | null {
    const item = go.getCell(col, row)?.item;
    return item instanceof GameBoardItemObject ? item : null;
  }

  /**
   * Cancels whatever tween a gem is in and snaps it to its cell before a new one
   * starts. Chains overlap by design — a gem can still be visually falling when the
   * next match claims it — and the model is already authoritative at that point, so
   * the stale tween is just leftover motion to discard.
   */
  private _resetGemOrNull(gem: GameBoardItemObject | null): GameBoardItemObject | null {
    if (!gem) return null;
    gem.killAnimations();
    gem.position.set(0, 0, 0);
    gem.scale.set(1, 1, 1);
    return gem;
  }

  private _swapPair(gridId: number, r1: number, c1: number, r2: number, c2: number): { gem1: GameBoardItemObject; gem2: GameBoardItemObject; cell1: GridCellObject; cell2: GridCellObject; go: GridObject } | null {
    const go = this.getGridObject(gridId);
    if (!go) return null;
    const cell1 = go.getCell(c1, r1);
    const cell2 = go.getCell(c2, r2);
    const g1 = cell1?.item;
    const g2 = cell2?.item;
    if (!(g1 instanceof GameBoardItemObject) || !(g2 instanceof GameBoardItemObject) || !cell1 || !cell2) return null;
    // Either gem may still be finishing a fall from an earlier chain; clear that
    // tween first so it cannot fight the swap and leave the gem off its cell.
    this._resetGemOrNull(g1);
    this._resetGemOrNull(g2);
    return { gem1: g1, gem2: g2, cell1, cell2, go };
  }

  private _localTowardCell(go: GridObject, sourceCell: GridCellObject, targetCol: number, targetRow: number): THREE.Vector3 {
    const targetCell = go.getCell(targetCol, targetRow);
    if (!targetCell) return new THREE.Vector3();
    const w = new THREE.Vector3();
    targetCell.getWorldPosition(w);
    return sourceCell.worldToLocal(w);
  }

  /** Opposite of grid `rowAxis`: gravity/refill tween toward +rowAxis (match-3 uses +Z as down). */
  private _negRowAxisOffset(go: GridObject, distance: number): THREE.Vector3 {
    const r = (go.preset as RectGridPreset).rowAxis;
    return new THREE.Vector3(-r.x * distance, -r.y * distance, -r.z * distance);
  }
}
