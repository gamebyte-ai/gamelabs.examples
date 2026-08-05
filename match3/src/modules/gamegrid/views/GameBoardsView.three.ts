import * as THREE from "three";
import gsap from "gsap";
import type { GridObject, IInstanceResolver, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridsView, type GridCellObject } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import type { GravityMove, RefillSpawn } from "../../../utilities/GameOperations.js";
import type { IGameBoardsView } from "./IGameBoardsView.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";

export class GameBoardsView extends GridsView implements IGameBoardsView {
  /** Just above the cell plane so the outline is never z-fighting the backdrop. */
  private static readonly OUTLINE_Y = 0.02;

  private _cellPointerDownHandler: ((gridId: number, col: number, row: number) => void) | null = null;
  private _config: Match3Config | null = null;
  private _outline: THREE.Mesh | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(Match3Config);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this._createBoardOutline();
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

    const w = cfg.cols * cfg.gridColumnSize + cfg.boardOutlinePadding * 2;
    const d = cfg.rows * cfg.gridRowSize + cfg.boardOutlinePadding * 2;
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

  public setCellPointerDownHandler(handler: ((gridId: number, col: number, row: number) => void) | null): void {
    this._cellPointerDownHandler = handler;
  }

  public override onGridCellPointerDown(gridId: number, col: number, row: number, _event: PointerEvent): void {
    this._cellPointerDownHandler?.(gridId, col, row);
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
      const tl = gsap.timeline({ onComplete: () => resolve() });
      tl.to(gem1.position, { x: t1.x, y: t1.y, z: t1.z, duration: half, ease: "power2.inOut" }, 0);
      tl.to(gem2.position, { x: t2.x, y: t2.y, z: t2.z, duration: half, ease: "power2.inOut" }, 0);
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
      const done = (): void => {
        left--;
        if (left <= 0) resolve();
      };
      gsap.to(gem1.position, { x: t1.x, y: t1.y, z: t1.z, duration: dur, ease: "power2.inOut", onComplete: done });
      gsap.to(gem2.position, { x: t2.x, y: t2.y, z: t2.z, duration: dur, ease: "power2.inOut", onComplete: done });
    });
  }

  public animateClearMatches(gridId: number, matches: { row: number; col: number }[]): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || matches.length === 0) return Promise.resolve();
    const total = cfg.animPopSec;
    const upDur = total * 0.42;
    const downDur = total * 0.52;
    const peak = cfg.animPopPeakScale;
    return new Promise((resolve) => {
      let n = matches.length;
      const doneOne = (): void => {
        n--;
        if (n <= 0) resolve();
      };
      for (const { row, col } of matches) {
        const gem = this._getGem(go, col, row);
        if (!gem) {
          doneOne();
          continue;
        }
        const tl = gsap.timeline({
          onComplete: () => {
            gem.killAnimations();
            gem.position.set(0, 0, 0);
            gem.scale.set(1, 1, 1);
            doneOne();
          }
        });
        tl.to(gem.scale, { x: peak, y: peak, z: peak, duration: upDur, ease: "back.out(1.55)" }, 0);
        tl.to(gem.scale, { x: 0.02, y: 0.02, z: 0.02, duration: downDur, ease: "power3.in" });
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
        const gem = this._getGem(go, m.toCol, m.toRow);
        if (!gem) {
          doneOne();
          continue;
        }
        const steps = Math.abs(m.toRow - m.fromRow) + Math.abs(m.toCol - m.fromCol);
        const lift = Math.max(1, steps) * cellStep * 0.92;
        gem.position.add(this._negRowAxisOffset(go, lift));
        gsap.to(gem.position, { x: 0, y: 0, z: 0, duration: dur, ease: "bounce.out", onComplete: () => {
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
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          const gem = this._getGem(go, s.col, s.row);
          if (!gem) continue;
          const depth = i + 1;
          gem.position.add(this._negRowAxisOffset(go, depth * step * 0.92));
          total++;
          gsap.to(gem.position, { x: 0, y: 0, z: 0, duration: dur, ease: "bounce.out", onComplete: check });
        }
      }
      if (total === 0) resolve();
    });
  }

  public override preDestroy(): void {
    this._stopAllGemAnimations();
    if (this._outline) {
      this._outline.removeFromParent();
      this._outline.geometry.dispose();
      (this._outline.material as THREE.Material).dispose();
      this._outline = null;
    }
    super.preDestroy();
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

  private _swapPair(gridId: number, r1: number, c1: number, r2: number, c2: number): { gem1: GameBoardItemObject; gem2: GameBoardItemObject; cell1: GridCellObject; cell2: GridCellObject; go: GridObject } | null {
    const go = this.getGridObject(gridId);
    if (!go) return null;
    const cell1 = go.getCell(c1, r1);
    const cell2 = go.getCell(c2, r2);
    const g1 = cell1?.item;
    const g2 = cell2?.item;
    if (!(g1 instanceof GameBoardItemObject) || !(g2 instanceof GameBoardItemObject) || !cell1 || !cell2) return null;
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
