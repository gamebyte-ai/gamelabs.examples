import type { IInjectionTarget, IInstanceResolver } from "@gamebyte/gamelabsjs";
import { CellType } from "../constants/CellType.js";
import type { PathCellInfo } from "../constants/PathCellInfo.js";
import { TowerDefenseConfig } from "../TowerDefenseConfig.js";
import type { ILevelState } from "./ILevelState.js";

export type { PathCellInfo } from "../constants/PathCellInfo.js";

/**
 * Owns the mutable level state for tower defense — the path waypoints
 * plus the cell-type queries derived from them.
 *
 * Lives in `utilities/` with the `*Manager` suffix — owns mutable
 * state for a subsystem and coordinates it across controllers.
 * Previously this state lived on {@link TowerDefenseConfig}, which
 * violated the rule that a config should hold only initial values /
 * tweaks / constants.
 *
 * Exposes the readonly query surface via {@link ILevelState}. Only
 * {@link import("./GameOperations.js").GameOperations} holds the
 * concrete reference and triggers `generateLevel()`.
 */
export class LevelManager implements IInjectionTarget, ILevelState {
  private _config!: TowerDefenseConfig;
  private _pathWaypoints: [number, number][] = LevelManager._buildDefaultPath();
  private _pathSet: Set<string> = new Set(this._pathWaypoints.map(([c, r]) => `${c},${r}`));

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(TowerDefenseConfig);
  }

  // ── Read API (treat as readonly from outside utilities) ──────────────

  public get pathWaypoints(): ReadonlyArray<readonly [col: number, row: number]> {
    return this._pathWaypoints;
  }

  /**
   * For a path cell, returns whether it is straight or a turn, whether
   * the turn bends right or left, and the Y-rotation angle needed to
   * orient a directional texture.
   *
   * Returns `null` for non-path cells, or for the first/last waypoint
   * (spawn/base) where neighbours don't form a through-path.
   */
  public getPathCellInfo(col: number, row: number): PathCellInfo | null {
    const path = this._pathWaypoints;
    for (let i = 1; i < path.length - 1; i++) {
      if (path[i][0] !== col || path[i][1] !== row) continue;

      const dx = path[i][0] - path[i - 1][0];
      const dz = path[i][1] - path[i - 1][1];
      const ex = path[i + 1][0] - path[i][0];
      const ez = path[i + 1][1] - path[i][1];

      const isTurn = dx !== ex || dz !== ez;

      if (!isTurn) {
        // Straight: road runs along the direction of travel.
        // Texture is drawn N→S (vertical); rotate PI/2 for E→W.
        return { isTurn: false, isRightTurn: false, rotation: dx !== 0 ? Math.PI / 2 : 0 };
      }

      // Turn: cross product determines handedness.
      const cross = dx * ez - dz * ex;
      const isRightTurn = cross < 0;

      // Rotation aligns the texture's south-entry side with the
      // actual entry side of this cell.
      const rotation = Math.atan2(dx, dz) - Math.PI;
      return { isTurn: true, isRightTurn, rotation };
    }
    return null;
  }

  public getCellType(col: number, row: number): CellType {
    const path = this._pathWaypoints;
    for (let i = 0; i < path.length; i++) {
      if (path[i][0] === col && path[i][1] === row) {
        if (i === 0) return CellType.Spawn;
        if (i === path.length - 1) return CellType.Base;
        return CellType.Path;
      }
    }
    // Cells adjacent (8-direction) to Spawn or Base are never placeable.
    if (this._isAdjacent8ToSpawnOrBase(col, row)) return CellType.Ground;
    // Cells adjacent (8-direction) to any path cell are placeable Tower cells.
    if (this._isAdjacent8ToPath(col, row)) return CellType.Tower;
    return CellType.Ground;
  }

  public colorForCellType(type: CellType): number {
    const cfg = this._config;
    switch (type) {
      case CellType.Ground: return cfg.groundColor;
      case CellType.Tower:  return cfg.towerColor;
      case CellType.Path:   return cfg.pathColor;
      case CellType.Spawn:  return cfg.spawnColor;
      case CellType.Base:   return cfg.baseColor;
    }
  }

  // ── Mutation: regenerate path ────────────────────────────────────────

  /**
   * Generates a new random level within the (cols-2)×(rows-2) playable
   * area. Places one Spawn and one Base with a random winding path
   * between them. Cells adjacent to the path become Tower; the rest
   * become Ground.
   */
  public generateLevel(): void {
    const cfg = this._config;
    const minCol = 1, maxCol = cfg.cols - 2;
    const minRow = 1, maxRow = cfg.rows - 2;

    // Spawn on the left edge, Base on the right edge of the playable area
    const spawnRow = LevelManager._randInt(minRow, maxRow);
    const baseRow = LevelManager._randInt(minRow, maxRow);
    const spawn: [number, number] = [minCol, spawnRow];
    const base: [number, number] = [maxCol, baseRow];

    this._pathWaypoints = LevelManager._generateWindingPath(
      spawn, base, minCol, maxCol, minRow, maxRow,
    );
    this._pathSet = new Set(this._pathWaypoints.map(([c, r]) => `${c},${r}`));
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _isAdjacent8ToPath(col: number, row: number): boolean {
    const ps = this._pathSet;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        if (ps.has(`${col + dc},${row + dr}`)) return true;
      }
    }
    return false;
  }

  private _isAdjacent8ToSpawnOrBase(col: number, row: number): boolean {
    const path = this._pathWaypoints;
    if (path.length === 0) return false;
    const spawn = path[0];
    const base = path[path.length - 1];
    return (
      LevelManager._isWithin8(col, row, spawn[0], spawn[1]) ||
      LevelManager._isWithin8(col, row, base[0], base[1])
    );
  }

  private static _isWithin8(col: number, row: number, tCol: number, tRow: number): boolean {
    const dc = Math.abs(col - tCol);
    const dr = Math.abs(row - tRow);
    return dc <= 1 && dr <= 1 && !(dc === 0 && dr === 0);
  }

  private static _randInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /**
   * Builds a single continuous winding path from `spawn` to `base` using
   * a randomised depth-first walk. Each step prefers to move toward the
   * goal but adds random noise so the path meanders. Full backtracking
   * ensures the walk always reaches the target — no dead ends or
   * branches.
   */
  private static _generateWindingPath(
    spawn: [number, number],
    base: [number, number],
    minCol: number,
    maxCol: number,
    minRow: number,
    maxRow: number,
  ): [number, number][] {
    const [baseCol, baseRow] = base;
    const visited = new Set<string>();
    const path: [number, number][] = [spawn];
    visited.add(`${spawn[0]},${spawn[1]}`);

    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (path.length > 0) {
      const [curCol, curRow] = path[path.length - 1];
      if (curCol === baseCol && curRow === baseRow) return path;

      // Collect unvisited in-bounds neighbours
      const neighbours: { col: number; row: number; score: number }[] = [];
      for (const [dc, dr] of dirs) {
        const nc = curCol + dc;
        const nr = curRow + dr;
        if (nc < minCol || nc > maxCol || nr < minRow || nr > maxRow) continue;
        if (visited.has(`${nc},${nr}`)) continue;
        const dist = Math.abs(nc - baseCol) + Math.abs(nr - baseRow);
        neighbours.push({ col: nc, row: nr, score: dist + Math.random() * 4 });
      }

      if (neighbours.length === 0) {
        // Dead end — backtrack but keep the cell marked visited so we
        // never re-explore it from a different branch. This guarantees
        // O(N) termination instead of exponential re-visitation.
        path.pop();
        continue;
      }

      neighbours.sort((a, b) => a.score - b.score);
      const next = neighbours[0];
      visited.add(`${next.col},${next.row}`);
      path.push([next.col, next.row]);
    }

    // Fallback (should never happen in a connected grid)
    return [spawn, base];
  }

  /**
   * S-shaped path across the 10×10 grid.
   * Spawn at (0,1), Base at (9,8).
   */
  private static _buildDefaultPath(): [number, number][] {
    const path: [number, number][] = [];

    // Row 1: right col 0 → 7
    for (let c = 0; c <= 7; c++) path.push([c, 1]);
    // Down at col 7: row 2 → 3
    for (let r = 2; r <= 3; r++) path.push([7, r]);
    // Row 3: left col 6 → 2
    for (let c = 6; c >= 2; c--) path.push([c, 3]);
    // Down at col 2: row 4 → 5
    for (let r = 4; r <= 5; r++) path.push([2, r]);
    // Row 5: right col 3 → 7
    for (let c = 3; c <= 7; c++) path.push([c, 5]);
    // Down at col 7: row 6 → 7
    for (let r = 6; r <= 7; r++) path.push([7, r]);
    // Row 7: left col 6 → 2
    for (let c = 6; c >= 2; c--) path.push([c, 7]);
    // Down at col 2: row 8
    path.push([2, 8]);
    // Row 8: right col 3 → 9
    for (let c = 3; c <= 9; c++) path.push([c, 8]);

    return path;
  }
}
