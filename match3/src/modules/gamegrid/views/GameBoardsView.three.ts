import * as THREE from "three";
import gsap from "gsap";
import type { GridItemObjectOptions, GridObject, IInstanceResolver, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridsView, ParticleBudget, type GridCellObject } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import { Match3AssetIds } from "../../../Match3AssetIds.js";
import type { IGameBoardsView } from "./IGameBoardsView.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";
import { GemPopEmitter } from "./GemPopEmitter.three.js";

/** A pooled score label: the shared quad, and a material whose map is swapped per colour. */
type ScoreLabel = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** A pooled blast flash — same shape, additive rather than plain. */
type LightFlash = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export class GameBoardsView extends GridsView implements IGameBoardsView {
  /** The board's own panel. Below the outline so an opaque panel cannot cover it. */
  private static readonly BACKDROP_Y = 0.015;
  /** Drawn over the panel, under the gem shadows (`0.045`). */
  private static readonly OUTLINE_Y = 0.02;
  /** Cookie bolts, above the gem quad (`0.06`) and its stripes (`0.065`) so they read over them. */
  private static readonly BEAM_Y = 0.08;
  /** Swap contact rings — over the gems, under the bolts. */
  private static readonly PULSE_Y = 0.07;
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
  /**
   * Callers waiting for the WHOLE board to stop moving, rather than for a named set of
   * gems. {@link _landingWatchers} answers "did the gems I just retargeted land?", which
   * is not the same question: a cascade retargets gems the earlier caller never named, so
   * a per-item watcher can resolve while the board is still visibly falling. The strict
   * clear/fall/settle order needs the board-wide answer.
   */
  private _restWatchers: (() => void)[] = [];
  private _popEmitter: GemPopEmitter | null = null;
  /**
   * Gems inside a swap tween. Their local offset is LATERAL, not height, so the fall
   * integrator must leave them alone — it reads any offset as distance still to drop
   * and would pull a swapping gem onto the vertical axis, landing it somewhere it was
   * never meant to be.
   */
  private readonly _swapping = new Set<number>();
  /** One score texture per gem colour, drawn on demand and shared from then on. */
  private readonly _scoreTextures = new Map<number, THREE.Texture>();
  /** Idle score labels, waiting to be shown again. See {@link _takeScoreLabel}. */
  private readonly _scorePool: ScoreLabel[] = [];
  /** The one quad every score label draws on — they are all the same size. */
  private _scoreQuad: THREE.PlaneGeometry | null = null;
  /** The one quad every cookie bolt draws on, scaled to length per bolt. */
  private _boltQuad: THREE.PlaneGeometry | null = null;
  /** Idle blast flashes, and the unit quad they all draw on. */
  private readonly _lightPool: LightFlash[] = [];
  private _lightQuad: THREE.PlaneGeometry | null = null;
  /** The glow texture. `undefined` until looked up, `null` if the asset never landed. */
  private _lightTex: THREE.Texture | null | undefined = undefined;
  /** Item ids currently pulsing white, and how far through the pulse each is. */
  private readonly _blinking = new Map<number, number>();
  /**
   * Where a gem was rendering, in WORLD space, at the moment its object was torn down.
   *
   * The grid model has no notion of a gem changing cell: `setCellItem` always emits
   * removed-then-added, so the view destroys the object and builds a new one, and the new
   * one is born at its cell's origin. Left alone that IS the snap — a gem handed a lower
   * cell mid-fall reappears already at the bottom of it.
   *
   * So the position is carried across the rebuild by hand. {@link destroyItem} records it
   * on the way out and {@link createItem} puts it back on the way in, which makes the
   * rebuild invisible: the gem keeps the exact world position it had, and its speed is
   * still in {@link _falls} under the same item id. Cell changes stop being events the
   * fall has to survive.
   */
  private readonly _worldOnRebuild = new Map<number, THREE.Vector3>();

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

  /**
   * Remembers where the gem was rendering before its object goes away, so that if this
   * teardown is a cell CHANGE rather than a clear, {@link createItem} can put the new
   * object exactly where the old one was.
   *
   * A clear leaves an entry nobody claims; {@link _pruneRebuildMemory} drops those once
   * the board is still, which is the only moment it is safe to tell the two apart.
   */
  public override destroyItem(itemId: number, gridId: number, col: number, row: number): void {
    // Still in its cell at this point — `super` is what takes it out.
    const gem = this._gemAt(gridId, col, row);
    if (gem?.itemId === itemId) {
      this._worldOnRebuild.set(itemId, gem.getWorldPosition(new THREE.Vector3()));
    }
    super.destroyItem(itemId, gridId, col, row);
  }

  /**
   * Builds the gem, then restores the world position it had before the rebuild — turning
   * a destroy/create pair back into the move it actually was.
   *
   * A genuinely new gem has nothing remembered and stays at its cell origin. Whether it
   * then falls is not decided here: {@link reconcileColumns} lifts the ones that entered
   * from above and registers the drop.
   */
  public override createItem(itemOptions: GridItemObjectOptions, gridId: number, col: number, row: number): void {
    super.createItem(itemOptions, gridId, col, row);

    const was = this._worldOnRebuild.get(itemOptions.itemId);
    if (!was) return;
    this._worldOnRebuild.delete(itemOptions.itemId);

    const gem = this._gemAt(gridId, col, row);
    if (!gem?.parent) return;
    gem.position.copy(gem.parent.worldToLocal(was.clone()));
  }

  /** The gem object in a cell, or null. */
  private _gemAt(gridId: number, col: number, row: number): GameBoardItemObject | null {
    const go = this.getGridObject(gridId);
    return go ? this._getGem(go, col, row) : null;
  }

  /**
   * Forgets the gems that were cleared rather than moved. Only run on a still board: while
   * anything is in flight an id missing from the grid may simply be mid-rebuild.
   */
  private _pruneRebuildMemory(): void {
    if (this._worldOnRebuild.size === 0) return;
    const go = this.getGridObject(Match3Config.GRID_ID);
    if (!go) return;

    const onBoard = this._gemsById(go);
    for (const itemId of [...this._worldOnRebuild.keys()]) {
      if (!onBoard.has(itemId)) this._worldOnRebuild.delete(itemId);
    }
  }

  public override postInitialize(): void {
    super.postInitialize();
    this._createBoardBackdrop();
    this._createBoardOutline();
    this._fillScorePool();
  }

  /**
   * Builds the score labels up front, so the first busy clear does not pay for them.
   *
   * Sized from the config rather than from the grid's preset — the preset is built from the
   * same two values, and reading them here keeps this independent of whether the grid object
   * exists yet.
   */
  private _fillScorePool(): void {
    const cfg = this._config;
    if (!cfg || cfg.scoreText.poolSize <= 0) return;

    const cellStep = Math.min(cfg.gridColumnSize, cfg.gridRowSize);
    const height = cfg.scoreText.sizeCells * cellStep;
    const width = height * 2;
    // Built into a list first, then handed over together: `_takeScoreLabel` serves the pool,
    // so pushing as we go would just keep re-serving the same label.
    const made: ScoreLabel[] = [];
    for (let i = 0; i < cfg.scoreText.poolSize; i++) made.push(this._takeScoreLabel(width, height));
    for (const label of made) {
      label.visible = false;
      this._scorePool.push(label);
    }
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

  /**
   * Fires a bolt from `from` at every cell in `targets`, and resolves the moment they
   * land — the caller pops the gems on impact, so this is the strike, not an overlay
   * on top of one.
   *
   * Drawn flat in the board plane: each bolt is a unit quad pivoted at the cookie and
   * stretched toward its target, so growing it along X is the shot travelling. Additive
   * blending with no depth write keeps crossing bolts bright where they overlap instead
   * of fighting each other for the same pixel.
   */
  public animateCookieBeams(
    gridId: number,
    from: { row: number; col: number },
    targets: { row: number; col: number }[],
    strikeSec?: number,
    delaySec = 0
  ): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || targets.length === 0) return Promise.resolve();
    // A combination times its own bolts; anything else takes the shared flight time.
    const flight = strikeSec ?? cfg.cookie.beam.strikeSec;
    if (flight <= 0) return Promise.resolve();

    const origin = go.getCell(from.col, from.row);
    if (!origin) return Promise.resolve();
    const world = new THREE.Vector3();
    origin.getWorldPosition(world);
    const start = this.worldToLocal(world.clone());

    // One quad for every bolt ever thrown, not one per volley. A volley is now a single
    // cell — the sweep is spaced per cell so the bolts are too — so building it per call
    // meant a geometry per struck gem, sixty-four of them for a cookie pair.
    //
    // The origin sits at one END, so scaling X grows the bolt away from the cookie rather
    // than out of its own middle. Done once, here.
    if (!this._boltQuad) {
      this._boltQuad = new THREE.PlaneGeometry(1, 1);
      this._boltQuad.translate(0.5, 0, 0);
    }
    const geometry = this._boltQuad;
    const spent: THREE.Object3D[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];

    return new Promise((resolve) => {
      let pending = targets.length;
      const landed = (): void => {
        pending--;
        if (pending > 0) return;
        resolve();
        // Cleanup rides on the fade, which plays out after the gems have gone.
        gsap.to(materials, {
          opacity: 0,
          duration: cfg.cookie.beam.fadeSec,
          // Kills the flicker tween on the same property, so nothing pulls the bolt
          // back up while it is fading.
          overwrite: true,
          onComplete: () => {
            for (const obj of spent) obj.removeFromParent();
            for (const m of materials) m.dispose();
          }
        });
      };

      for (const target of targets) {
        const cell = go.getCell(target.col, target.row);
        if (!cell) {
          landed();
          continue;
        }
        cell.getWorldPosition(world);
        const end = this.worldToLocal(world.clone());
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (length < 1e-4) {
          landed();
          continue;
        }

        const material = new THREE.MeshBasicMaterial({
          color: cfg.cookie.beam.color,
          transparent: true,
          opacity: cfg.cookie.beam.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        materials.push(material);

        const bolt = new THREE.Mesh(geometry, material);
        bolt.rotation.x = -Math.PI / 2;
        // ±40%, so a volley of bolts is ragged rather than a set of identical bars.
        bolt.scale.set(0, cfg.cookie.beam.thickness * (0.6 + Math.random() * 0.8), 1);

        const pivot = new THREE.Group();
        pivot.position.copy(start);
        pivot.position.y = GameBoardsView.BEAM_Y;
        pivot.rotation.y = -Math.atan2(dz, dx);
        pivot.add(bolt);
        this.add(pivot);
        spent.push(pivot);

        // Hidden until its turn, for the same reason the score labels are: a sweep spaced
        // finer than the timer's floor hands out several volleys in one frame.
        pivot.visible = delaySec <= 0;
        gsap.to(bolt.scale, {
          x: length,
          duration: flight,
          delay: delaySec,
          // Accelerating: slow off the cookie, fastest at the moment it connects.
          ease: "power2.in",
          onStart: () => (pivot.visible = true),
          onComplete: landed
        });
        if (cfg.cookie.beam.flickers > 0) {
          gsap.to(material, {
            opacity: cfg.cookie.beam.opacity * 0.45,
            duration: flight / (cfg.cookie.beam.flickers * 2),
            delay: delaySec,
            repeat: cfg.cookie.beam.flickers * 2 - 1,
            yoyo: true
          });
        }
      }
    });
  }

  /**
   * A ring on each swapped cell, growing outward and fading — the contact between the
   * two gems.
   *
   * Fire and forget: it outlives the swap tween and nothing waits on it, so a fast
   * player can start the next move while the last one is still fading.
   */
  public animateSwapPulse(gridId: number, cells: { row: number; col: number }[]): void {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || !cfg.swapPulse.enabled || cfg.swapPulse.sec <= 0) return;

    const preset = go.preset as RectGridPreset;
    const cellStep = Math.min(preset.columnSize, preset.rowSize);
    // Built at diameter 1 so the configured sizes are a straight scale in cells. A
    // thickness of 1 leaves no hole, which is how `thickness` reaches a filled disc.
    const inner = 0.5 * Math.max(0, 1 - Math.min(1, cfg.swapPulse.thickness));
    const geometry = new THREE.RingGeometry(inner, 0.5, 48);
    const material = new THREE.MeshBasicMaterial({
      color: cfg.swapPulse.color,
      transparent: true,
      opacity: cfg.swapPulse.opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const world = new THREE.Vector3();
    const rings: THREE.Mesh[] = [];
    for (const at of cells) {
      const cell = go.getCell(at.col, at.row);
      if (!cell) continue;
      cell.getWorldPosition(world);

      const ring = new THREE.Mesh(geometry, material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(this.worldToLocal(world.clone()));
      ring.position.y = GameBoardsView.PULSE_Y;
      ring.scale.setScalar(cfg.swapPulse.fromCells * cfg.swapPulse.scale * cellStep);
      this.add(ring);
      rings.push(ring);
    }
    if (rings.length === 0) {
      geometry.dispose();
      material.dispose();
      return;
    }

    const to = cfg.swapPulse.toCells * cfg.swapPulse.scale * cellStep;
    gsap.to(
      rings.map((r) => r.scale),
      { x: to, y: to, z: to, duration: cfg.swapPulse.sec, ease: "power2.out" }
    );
    gsap.to(material, {
      opacity: 0,
      duration: cfg.swapPulse.sec,
      ease: "power1.in",
      onComplete: () => {
        for (const ring of rings) ring.removeFromParent();
        geometry.dispose();
        material.dispose();
      }
    });
  }

  /**
   * Grows a just-created special into place over the same span as the pop, so it forms
   * while the gems that earned it are vanishing and is finished exactly when they are.
   *
   * Scale only: the fall integrator owns position and the blink owns opacity, so this
   * cannot fight either of them, and a gem that starts falling mid-growth keeps growing
   * on the way down.
   */
  public animateSpecialSpawn(gridId: number, at: { row: number; col: number }): void {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go) return;

    const gem = this._getGem(go, at.col, at.row);
    if (!gem || cfg.animPopSec <= 0) return;

    const target = { x: gem.scale.x, y: gem.scale.y, z: gem.scale.z };
    gem.scale.setScalar(0.02);
    gsap.to(gem.scale, {
      ...target,
      duration: cfg.animPopSec,
      // A touch of overshoot: the special settles into its cell rather than simply
      // reaching full size, which is what makes it read as forming.
      ease: "back.out(1.7)",
      overwrite: true
    });
  }

  /**
   * The shockwave a firing stripe sends both ways along its line.
   *
   * Fire and forget: it is pure decoration and outlives the gem that threw it, so it is
   * not awaited and nothing waits on it. Each half travels clear of the board and is
   * dropped once it is well outside the frame — it leaves the screen rather than
   * stopping at the last cell.
   */
  public animateStripeWave(gridId: number, at: { row: number; col: number }, alongRow: boolean): void {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || !cfg.stripe.wave.enabled || cfg.stripeWaveCellsPerSec <= 0) return;

    const origin = go.getCell(at.col, at.row);
    if (!origin) return;
    const world = new THREE.Vector3();
    origin.getWorldPosition(world);
    const start = this.worldToLocal(world.clone());

    const preset = go.preset as RectGridPreset;
    // A row stripe clears its ROW, so its wave runs along the column axis; a column
    // stripe is the other way round.
    const axis = alongRow ? preset.columnAxis : preset.rowAxis;
    const heading = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
    const cellStep = alongRow ? preset.columnSize : preset.rowSize;
    const lanes = alongRow ? cfg.cols : cfg.rows;
    // Half the board plus the overshoot: far enough to be off screen before it stops.
    const distance = (lanes / 2 + cfg.stripe.wave.overshootCells) * cellStep;

    const geometry = this._buildWaveGeometry(
      cfg.stripe.wave.lengthCells * cellStep,
      cfg.stripe.wave.widthCells * cellStep,
      cfg.stripe.wave.bowCells * cellStep
    );
    const material = new THREE.MeshBasicMaterial({
      color: cfg.stripe.wave.color,
      transparent: true,
      opacity: cfg.stripe.wave.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // The strip is hand-built, so which way it winds is not worth depending on.
      side: THREE.DoubleSide
    });

    let alive = 2;
    const drop = (obj: THREE.Object3D) => (): void => {
      obj.removeFromParent();
      alive--;
      if (alive > 0) return;
      geometry.dispose();
      material.dispose();
    };

    for (const direction of [1, -1]) {
      // Built at its real size, so it is not scaled here — scaling would stretch the bow
      // along with everything else and the curve would no longer be the one configured.
      const bar = new THREE.Mesh(geometry, material);
      bar.rotation.x = -Math.PI / 2;

      const pivot = new THREE.Group();
      pivot.position.copy(start);
      pivot.position.y = GameBoardsView.BEAM_Y;
      pivot.rotation.y = -Math.atan2(heading.z * direction, heading.x * direction);
      pivot.add(bar);
      this.add(pivot);

      // Constant speed: the pops it is travelling with are evenly spaced, so any easing
      // would put the wave front ahead of some of them and behind others.
      gsap.to(bar.position, {
        x: distance,
        duration: distance / (cfg.stripeWaveCellsPerSec * cellStep),
        ease: "none",
        onComplete: drop(pivot)
      });
    }
  }

  /**
   * The wave's shape: a strip across the lane, bowed FORWARD in the middle by `bow`.
   *
   * A flat quad reads as a bar being pushed along. Bending it makes it read as a front
   * travelling out from the gem — the middle, closest to where it came from, runs ahead
   * and the edges trail. The bulge is a parabola over the lane, so it is strongest at the
   * centre line and dies to nothing at the edges, and `bow: 0` gives back the flat bar.
   */
  private _buildWaveGeometry(depth: number, width: number, bow: number): THREE.BufferGeometry {
    // Enough segments that the curve reads as a curve rather than a chevron.
    const segments = 24;
    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const lateral = (t - 0.5) * width;
      const lead = bow * (1 - Math.pow(2 * (t - 0.5), 2));
      positions.push(lead + depth * 0.5, lateral, 0);
      positions.push(lead - depth * 0.5, lateral, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  /**
   * Whether the gem in this cell is still ABOVE the board — owning a playable cell but
   * not yet inside the window the player can see.
   *
   * Owning a cell and having arrived in it are two different things: gravity assigns a
   * cell the instant a gap opens, while the gem may still be rows above it. A wave that
   * asks the model alone clears a gem the player cannot see, out of a cell that looks
   * empty — so the waves ask this too.
   */
  public isAboveBoard(gridId: number, row: number, col: number): boolean {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go) return false;

    const gem = this._getGem(go, col, row);
    if (!gem || !this._falls.has(gem.itemId)) return false;

    const top = go.getCell(col, cfg.firstVisibleRow);
    if (!top) return false;
    const preset = go.preset as RectGridPreset;
    const gemPos = gem.getWorldPosition(new THREE.Vector3());
    const topPos = top.getWorldPosition(new THREE.Vector3());
    // The board runs +row along +Z, so a gem at a smaller Z than the top row — by more
    // than half a cell, to leave the one that is just arriving alone — is still outside.
    return gemPos.z < topPos.z - Math.min(preset.rowSize, preset.columnSize) * 0.5;
  }

  /**
   * Floats the score up off each of these cells.
   *
   * One texture for the whole board — the number never changes — and a quad per cell that
   * drifts up and fades. Fire and forget: nothing waits for it, and it outlives the gem it
   * came from.
   */
  public showScoreText(gridId: number, cells: { row: number; col: number }[], delaySec = 0): void {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || !cfg.scoreText.enabled || cells.length === 0) return;

    const preset = go.preset as RectGridPreset;
    const cellStep = Math.min(preset.columnSize, preset.rowSize);
    const height = cfg.scoreText.sizeCells * cellStep;
    const width = height * 2;
    const world = new THREE.Vector3();

    for (const at of cells) {
      const cell = go.getCell(at.col, at.row);
      if (!cell) continue;
      cell.getWorldPosition(world);

      // The gem is still standing at this point — the clear has not run yet — so its
      // colour is there to be read. A score in the colour of what popped says WHICH gem
      // it came from, which a white one cannot.
      const gemType = this._getGem(go, at.col, at.row)?.gemType ?? -1;
      const label = this._takeScoreLabel(width, height);
      const material = label.material;
      // Only the colour differs between labels, and the texture for it is already cached —
      // so a recycled label needs nothing but a different map and its opacity back.
      material.map = this._scoreTexture(cfg, gemType);
      material.opacity = 1;
      label.position.copy(this.worldToLocal(world.clone()));
      label.position.y = GameBoardsView.BEAM_Y + 0.01;
      this.add(label);

      // Hidden until its turn. `delaySec` is how much longer this label has to wait, and the
      // caller may hand out several in the same frame — a sweep step shorter than a frame
      // runs more than one step before the browser paints. Held on the tween rather than on
      // the caller's clock, so the labels still come out one at a time however finely the
      // sweep is spaced.
      label.visible = delaySec <= 0;
      const up = this._negRowAxisOffset(go, cfg.scoreText.riseCells * cellStep);
      gsap.to(label.position, {
        x: label.position.x + up.x,
        z: label.position.z + up.z,
        duration: cfg.scoreText.sec,
        delay: delaySec,
        ease: cfg.scoreText.ease,
        onStart: () => (label.visible = true)
      });
      // The label lives as long as the fade, which is the one that ends it — it may outlast
      // the climb, and disposing on the climb would cut the fade off mid-way.
      gsap.to(material, {
        opacity: 0,
        duration: cfg.scoreText.fadeSec,
        delay: delaySec,
        ease: cfg.scoreText.fadeEase,
        onComplete: () => this._putScoreLabel(label)
      });
    }
  }

  /**
   * A score label, recycled if one is idle. Nothing about a label is per-instance except
   * its material's map and opacity, so they are handed out and taken back rather than built
   * and thrown away — a cookie pair alone would otherwise churn a mesh, a geometry and a
   * material for all sixty-four cells inside a second.
   *
   * The quad is SHARED: every label is the same size, which is a function of the cell size
   * and `sizeCells` and so fixed for the life of the board.
   */
  private _takeScoreLabel(width: number, height: number): ScoreLabel {
    this._scoreQuad ??= new THREE.PlaneGeometry(width, height);

    const idle = this._scorePool.pop();
    if (idle) {
      // A label can be taken back while a tween still holds it — an interrupted clear, a
      // board torn down mid-fade — so anything still driving it is cut before it is reused.
      gsap.killTweensOf(idle.position);
      gsap.killTweensOf(idle.material);
      return idle;
    }

    const label = new THREE.Mesh(this._scoreQuad, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    label.rotation.x = -Math.PI / 2;
    return label;
  }

  /** Takes a label out of the scene and back into the pool. Nothing is disposed. */
  private _putScoreLabel(label: ScoreLabel): void {
    label.visible = false;
    label.removeFromParent();
    this._scorePool.push(label);
  }

  /**
   * The flash of light a popping gem leaves on its cell: grows the whole time, fading in
   * and then out. Every clear gets it, a plain three-match as much as a blast.
   *
   * Additive, so it lights what is under it rather than covering it — the gem shrinking
   * beneath the flash reads through it, which is what makes it look like light and not a
   * white disc laid on the board.
   */
  public animatePopLight(gridId: number, cells: { row: number; col: number }[], delaySec = 0): void {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || !cfg.popLight.enabled || cells.length === 0) return;

    const texture = this._lightTexture();
    if (!texture) return;

    const light = cfg.popLight;
    const life = light.inSec + light.outSec;
    if (life <= 0) return;

    const preset = go.preset as RectGridPreset;
    const full = light.sizeCells * Math.min(preset.columnSize, preset.rowSize);
    const world = new THREE.Vector3();

    for (const at of cells) {
      const cell = go.getCell(at.col, at.row);
      if (!cell) continue;
      cell.getWorldPosition(world);

      const flash = this._takeLightFlash(texture);
      flash.material.color.set(light.color);
      flash.material.opacity = 0;
      flash.position.copy(this.worldToLocal(world.clone()));
      // Over the bolts, so a blast lights whatever else the clear is drawing.
      flash.position.y = GameBoardsView.BEAM_Y + 0.02;
      flash.scale.setScalar(full * light.scaleFrom);
      // Held back like every other clear visual, so a blast reached on a later step of a
      // sweep lights up when the sweep gets there.
      flash.visible = delaySec <= 0;
      this.add(flash);

      gsap.to(flash.scale, {
        x: full,
        y: full,
        z: full,
        duration: life,
        delay: delaySec,
        ease: "power2.out",
        onStart: () => (flash.visible = true)
      });
      // In then out as one sequence, so the peak lands between them rather than at the start.
      gsap
        .timeline({ delay: delaySec })
        .to(flash.material, { opacity: light.opacity, duration: light.inSec, ease: "none" })
        .to(flash.material, {
          opacity: 0,
          duration: light.outSec,
          ease: "power2.in",
          onComplete: () => this._putLightFlash(flash)
        });
    }
  }

  /** The glow texture, resolved once. Null until the asset has landed. */
  private _lightTexture(): THREE.Texture | null {
    if (this._lightTex === undefined) {
      this._lightTex = this.assetLoader.getAsset<THREE.Texture>(Match3AssetIds.Light) ?? null;
    }
    return this._lightTex;
  }

  private _takeLightFlash(texture: THREE.Texture): LightFlash {
    // A unit quad, scaled per flash — so `sizeCells` can change without a new geometry.
    this._lightQuad ??= new THREE.PlaneGeometry(1, 1);

    const idle = this._lightPool.pop();
    if (idle) {
      gsap.killTweensOf(idle.scale);
      gsap.killTweensOf(idle.material);
      return idle;
    }

    const flash = new THREE.Mesh(
      this._lightQuad,
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    flash.rotation.x = -Math.PI / 2;
    return flash;
  }

  private _putLightFlash(flash: LightFlash): void {
    flash.visible = false;
    flash.removeFromParent();
    this._lightPool.push(flash);
  }

  /**
   * The pooled labels outlive the clears that use them, so the board is what has to let
   * them go — nothing else ever will.
   */
  public override destroy(): void {
    for (const label of this._scorePool) {
      gsap.killTweensOf(label.position);
      gsap.killTweensOf(label.material);
      label.removeFromParent();
      label.material.dispose();
    }
    this._scorePool.length = 0;
    this._scoreQuad?.dispose();
    this._scoreQuad = null;
    this._boltQuad?.dispose();
    this._boltQuad = null;
    for (const flash of this._lightPool) {
      gsap.killTweensOf(flash.scale);
      gsap.killTweensOf(flash.material);
      flash.removeFromParent();
      flash.material.dispose();
    }
    this._lightPool.length = 0;
    this._lightQuad?.dispose();
    this._lightQuad = null;
    for (const texture of this._scoreTextures.values()) texture.dispose();
    this._scoreTextures.clear();
    super.destroy();
  }

  /** The number in one gem's colour, drawn once into a canvas and cached. */
  private _scoreTexture(cfg: Match3Config, gemType: number): THREE.Texture {
    const cached = this._scoreTextures.get(gemType);
    if (cached) return cached;

    const palette = Match3Config.GEM_PALETTE;
    const fill =
      gemType >= 0 ? `#${palette[gemType % palette.length].toString(16).padStart(6, "0")}` : cfg.scoreText.color;
    const texture = this._buildScoreTexture(cfg, fill);
    this._scoreTextures.set(gemType, texture);
    return texture;
  }

  private _buildScoreTexture(cfg: Match3Config, fill: string): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "bold 88px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(String(cfg.scoreText.points), 128, 64);
    ctx.fillStyle = fill;
    ctx.fillText(String(cfg.scoreText.points), 128, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Marks gems that should pulse. Keyed by item id so the pulse follows the gem if the
   * board shifts under it; anything no longer listed is restored to its normal look.
   */
  public setBlinking(gridId: number, cells: { row: number; col: number }[]): void {
    const go = this.getGridObject(gridId);
    if (!go) return;

    const wanted = new Set<number>();
    for (const { row, col } of cells) {
      const gem = this._getGem(go, col, row);
      if (gem) wanted.add(gem.itemId);
    }

    for (const itemId of [...this._blinking.keys()]) {
      if (wanted.has(itemId)) continue;
      this._blinking.delete(itemId);
      this._gemsById(go).get(itemId)?.setTint(null);
    }
    for (const itemId of wanted) if (!this._blinking.has(itemId)) this._blinking.set(itemId, 0);
  }

  /** Advances the white pulse on waiting boosters. */
  private _stepBlinks(dtSeconds: number, byId: Map<number, GameBoardItemObject>, cfg: Match3Config): void {
    if (this._blinking.size === 0) return;
    const step = Math.max(0.01, cfg.bomb.blinkStepSec);

    for (const [itemId, elapsed] of [...this._blinking]) {
      const gem = byId.get(itemId);
      if (!gem) {
        this._blinking.delete(itemId);
        continue;
      }
      const next = elapsed + dtSeconds;
      this._blinking.set(itemId, next);
      // A half-cosine gives a smooth fade in and out rather than a hard flash.
      gem.setTint(0.5 - 0.5 * Math.cos((Math.PI * next) / step));
    }
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
  public animateClearMatches(gridId: number, matches: { row: number; col: number; wave?: number }[], delaySec = 0): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || matches.length === 0) return Promise.resolve();
    const total = cfg.animPopSec;
    // 0 means no pop visual at all — the gems just vanish with the model. Skipping the
    // ghost entirely (rather than tweening it for 0s) keeps the board clean while the
    // fall is under test.
    if (total <= 0) return Promise.resolve();
    const preset = go.preset as RectGridPreset;
    const cellStep = Math.min(preset.columnSize, preset.rowSize);
    const accel = cfg.fallAccelCellsPerSec2 * cellStep;
    const up = this._negRowAxisOffset(go, 1).normalize();
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
        // The GEM's own position, wherever it actually is — mid-fall included. A gem
        // caught in a blast while it is still coming down shrinks away in the air, which
        // is what it looks like it should do.
        //
        // This used to read the CELL's position instead, to stop a gem descending from the
        // reserve from popping forty rows above the board. That guard now lives with the
        // rule rather than the visual: {@link isAboveBoard} keeps a gem that has not
        // reached the playable window out of the clear altogether, so nothing off-screen
        // can be popped and the visual is free to be honest about where the gem is. Using
        // the cell for everything was what teleported a falling gem to the cell centre
        // before shrinking it.
        gem.getWorldPosition(world);
        this.add(ghost);
        ghost.position.copy(this.worldToLocal(world.clone()));
        ghost.scale.copy(gem.scale);

        // Held until the pop actually starts, like the ghost itself. Fired here it went off
        // the moment the step was PLANNED, so on a staggered sweep the sparks ran ahead of
        // the gems they came from.
        //
        // The colour is the gem's own, so a burst says which gem it was.
        const sparkColor = Match3Config.GEM_PALETTE[gem.gemType % Match3Config.GEM_PALETTE.length];
        const burst = (): void => {
          this._popEmitter?.burst(ghost.position, sparkColor, cfg.popParticles.count);
        };

        const end = (): void => {
          ghost.removeFromParent();
          doneOne();
        };
        // A gem taken out of the air carries on down while it shrinks. The real object is
        // gone the moment the model clears the cell, so without this the ghost stops dead
        // where the gem was and shrinks in place — the same jolt as popping at the cell
        // centre, just higher up. Integrated over the whole visible life of the ghost, the
        // sweep delay included, so it never sits still.
        const fall = this._falls.get(gem.itemId);
        const life = (wave ?? 0) * cfg.clear.stepSec + total;
        if (fall && life > 0) {
          const drop = fall.speed * life + 0.5 * accel * life * life;
          const to = ghost.position.clone().addScaledVector(up, -drop);
          gsap.to(ghost.position, { x: to.x, y: to.y, z: to.z, duration: life, delay: delaySec, ease: "none", overwrite: true });
        }
        // Straight to shrinking — no scale-up overshoot first. Effects will layer on
        // top of this later, so the pop itself stays a plain uniform shrink.
        gsap.to(ghost.scale, {
          x: 0.02,
          y: 0.02,
          z: 0.02,
          // Cells further along a sweep start later, so the line clears outward from
          // the gem that fired it rather than vanishing in one go. `delaySec` is the step's
          // own hold-off, for a sweep finer than the timer can space.
          delay: delaySec + (wave ?? 0) * cfg.clear.stepSec,
          duration: total,
          ease: cfg.animPopEase,
          overwrite: true,
          onStart: burst,
          onComplete: end,
          onInterrupt: end
        });
      }
    });
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
  public reconcileColumns(gridId: number, cols: ReadonlySet<number>, spawned: ReadonlySet<number>): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go) return Promise.resolve();
    const preset = go.preset as RectGridPreset;
    const cellStep = Math.min(preset.columnSize, preset.rowSize);
    const up = this._negRowAxisOffset(go, 1).normalize();

    const watched: number[] = [];
    for (const col of cols) {
      // Highest point anything in this column is currently occupying. A new gem must
      // start above it, or it is born inside a gem that is still on its way down.
      let airspace = 0;
      let fresh = 0;
      for (let row = 0; row < go.rowCount; row++) {
        const gem = this._getGem(go, col, row);
        if (!gem) continue;
        if (spawned.has(gem.itemId)) fresh++;
        airspace = Math.max(airspace, this._falls.get(gem.itemId)?.height ?? 0);
      }
      const spawnLift = Math.max((fresh + cfg.spawnLiftCells) * cellStep, airspace + cellStep);

      for (let row = 0; row < go.rowCount; row++) {
        const gem = this._getGem(go, col, row);
        if (!gem) continue;

        // A swap tween owns this gem's offset and it is LATERAL, not height — leave it be.
        if (this._swapping.has(gem.itemId)) continue;
        // Landed and just playing its dip. Resetting its position every pass would fight
        // the bounce and show up as a stutter.
        if (this._bounces.has(gem.itemId) && !this._falls.has(gem.itemId)) continue;

        // Only the gems that entered from above are placed here. Everything else is
        // ALREADY in the right place: a gem whose cell changed had its world position
        // carried across the rebuild by {@link createItem}, and one that never moved was
        // never touched. This is what used to be done from a per-pass snapshot, and the
        // gems that snapped were the ones the snapshot could not account for.
        if (spawned.has(gem.itemId)) gem.position.copy(up.clone().multiplyScalar(spawnLift));

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
    if (!cfg || !go) return;

    // Blinking is independent of movement — a booster waits, and pulses, whether or not
    // anything happens to be falling at that instant. Stepping it after the guard below
    // froze the pulse the moment the board went quiet.
    if (this._blinking.size > 0) this._stepBlinks(dtSeconds, this._gemsById(go), cfg);

    if (this._falls.size === 0 && this._bounces.size === 0) {
      // A board-wide waiter may still be holding. `_falls` can be emptied from outside
      // this loop — a gem cleared while it was in the air, or a reconcile that found one
      // already home — and with the early return below the waiter would never be looked
      // at again, leaving the board waiting for a fall that had already finished.
      this._resolveRest();
      return;
    }

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
    this._resolveRest();
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
   * Resolves once NOTHING on the board is falling any more.
   *
   * Bounces are deliberately not waited on: a bouncing gem has already reached its cell
   * and its dip is decoration, so holding the board for it would add a pause to every
   * cascade step for no rule reason.
   *
   * Resolves synchronously when the board is already still. The caller has to be able to
   * ask without knowing whether anything is in flight, and {@link stepFalls} returns
   * early on a quiet board — a watcher registered then would never be looked at again.
   */
  public waitForBoardAtRestAsync(): Promise<void> {
    if (this._falls.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this._restWatchers.push(resolve);
    });
  }

  /** Releases the board-wide waiters, once per frame that ends with nothing in flight. */
  private _resolveRest(): void {
    if (this._falls.size > 0) return;
    // A still board is the one moment a remembered position can be told apart from a gem
    // that was cleared, so the memory is swept here rather than on every rebuild.
    this._pruneRebuildMemory();
    if (this._restWatchers.length === 0) return;
    const waiting = this._restWatchers;
    this._restWatchers = [];
    for (const resolve of waiting) resolve();
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
