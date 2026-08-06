import * as THREE from "three";
import gsap from "gsap";
import type { GridObject, IInstanceResolver, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridsView, type GridCellObject } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import type { GravityMove, RefillSpawn } from "../../../utilities/GameOperations.js";
import type { IGameBoardsView } from "./IGameBoardsView.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";

export class GameBoardsView extends GridsView implements IGameBoardsView {
  /** The board's own panel. Below the outline so an opaque panel cannot cover it. */
  private static readonly BACKDROP_Y = 0.015;
  /** Drawn over the panel, under the gem shadows (`0.045`). */
  private static readonly OUTLINE_Y = 0.02;

  private _cellPointerDownHandler: ((gridId: number, col: number, row: number, event: PointerEvent) => void) | null = null;
  private _config: Match3Config | null = null;
  private _outline: THREE.Mesh | null = null;
  private _backdrop: THREE.Mesh | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(Match3Config);
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
      const home = (): void => {
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
      // The model applies the swap once this resolves, so an interrupted tween must
      // still settle and report — otherwise the swap would never be committed.
      const done = (): void => {
        left--;
        if (left <= 0) resolve();
      };
      gsap.to(gem1.position, { x: t1.x, y: t1.y, z: t1.z, duration: dur, ease: "power2.inOut", overwrite: true, onComplete: done, onInterrupt: done });
      gsap.to(gem2.position, { x: t2.x, y: t2.y, z: t2.z, duration: dur, ease: "power2.inOut", overwrite: true, onComplete: done, onInterrupt: done });
    });
  }

  /**
   * Pops the matched gems. Each one is DETACHED from its cell first
   * (`GridCellObject.takeItem()`) and reparented onto this view at the same world
   * position, so the pop is no longer tied to the cell's lifetime: the model can be
   * cleared and the gems above can start falling immediately while the pop plays
   * out. Waiting for the pop before dropping was the stall it replaces.
   *
   * Detaching also means this view now owns the object, so each gem is disposed when
   * its tween ends — the framework's `destroyItem` bails out on a cell it no longer
   * holds an item for, so nothing else will clean it up.
   */
  public animateClearMatches(gridId: number, matches: { row: number; col: number }[]): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || matches.length === 0) return Promise.resolve();
    const total = cfg.animPopSec;
    return new Promise((resolve) => {
      let n = matches.length;
      const doneOne = (): void => {
        n--;
        if (n <= 0) resolve();
      };
      const world = new THREE.Vector3();
      for (const { row, col } of matches) {
        const cell = go.getCell(col, row);
        const taken = cell?.takeItem();
        const gem = taken instanceof GameBoardItemObject ? this._resetGemOrNull(taken) : null;
        if (!cell || !gem) {
          doneOne();
          continue;
        }
        // Reparenting resets the local frame, so re-place the gem where it already
        // appeared on screen.
        cell.getWorldPosition(world);
        this.add(gem);
        gem.position.copy(this.worldToLocal(world.clone()));

        const end = (): void => {
          this._disposeGem(gem);
          doneOne();
        };
        // Straight to shrinking — no scale-up overshoot first. Effects will layer on
        // top of this later, so the pop itself stays a plain uniform shrink.
        gsap.to(gem.scale, {
          x: 0.02,
          y: 0.02,
          z: 0.02,
          duration: total,
          ease: cfg.animPopEase,
          overwrite: true,
          onComplete: end,
          onInterrupt: end
        });
      }
    });
  }

  public animateGravityMoves(gridId: number, moves: GravityMove[]): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || moves.length === 0) return Promise.resolve();
    const dur = cfg.animFallSec;
    const preset = go.preset as RectGridPreset;
    const cellStep = Math.min(preset.columnSize, preset.rowSize);
    return new Promise((resolve) => {
      let n = moves.length;
      const doneOne = (): void => {
        n--;
        if (n <= 0) resolve();
      };
      for (const m of moves) {
        const gem = this._resetGemOrNull(this._getGem(go, m.toCol, m.toRow));
        if (!gem) {
          doneOne();
          continue;
        }
        const steps = Math.abs(m.toRow - m.fromRow) + Math.abs(m.toCol - m.fromCol);
        // Exactly the distance travelled — a fudge factor here would start the gem
        // short of the cell it is leaving, which shows up as a jump on frame one.
        const lift = Math.max(1, steps) * cellStep;
        gem.position.add(this._negRowAxisOffset(go, lift));
        gsap.to(gem.position, { x: 0, y: 0, z: 0, duration: dur, ease: cfg.animFallEase, onComplete: () => {
          gem.position.set(0, 0, 0);
          doneOne();
        } });
      }
    });
  }

  public animateRefillSpawns(gridId: number, spawns: RefillSpawn[]): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || spawns.length === 0) return Promise.resolve();
    const dur = cfg.animSpawnSec;
    const preset = go.preset as RectGridPreset;
    const step = Math.min(preset.columnSize, preset.rowSize);
    const byCol = new Map<number, RefillSpawn[]>();
    for (const s of spawns) {
      const list = byCol.get(s.col) ?? [];
      list.push(s);
      byCol.set(s.col, list);
    }
    for (const [, list] of byCol) list.sort((a, b) => a.row - b.row);
    return new Promise((resolve) => {
      let total = 0;
      let completed = 0;
      const check = (): void => {
        completed++;
        if (completed >= total) resolve();
      };
      for (const [, list] of byCol) {
        // One lift for the whole column, not a per-gem depth. Their targets are
        // already a cell apart, so a shared offset keeps that exact spacing and puts
        // the new run directly above the board — the column reads as one continuous
        // stack sliding in. Per-gem offsets bunched them together at the start and
        // let them spread out mid-fall.
        const lift = list.length * step;
        for (const s of list) {
          const gem = this._resetGemOrNull(this._getGem(go, s.col, s.row));
          if (!gem) continue;
          gem.position.add(this._negRowAxisOffset(go, lift));
          total++;
          gsap.to(gem.position, { x: 0, y: 0, z: 0, duration: dur, ease: cfg.animFallEase, onComplete: check });
        }
      }
      if (total === 0) resolve();
    });
  }

  public override preDestroy(): void {
    this._stopAllGemAnimations();
    this._disposeMesh(this._outline);
    this._outline = null;
    this._disposeMesh(this._backdrop);
    this._backdrop = null;
    super.preDestroy();
  }

  /** Frees a gem this view took over from a cell, GPU resources included. */
  private _disposeGem(gem: GameBoardItemObject): void {
    gem.killAnimations();
    gem.removeFromParent();
    gem.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const material = node.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    });
  }

  private _disposeMesh(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  private _stopAllGemAnimations(): void {
    const go = this.getGridObject(Match3Config.GRID_ID);
    if (!go) return;
    for (let c = 0; c < go.columnCount; c++) {
      for (let r = 0; r < go.rowCount; r++) {
        const item = go.getCell(c, r)?.item;
        if (item instanceof GameBoardItemObject) item.killAnimations();
      }
    }
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
