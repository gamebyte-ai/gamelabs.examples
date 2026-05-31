import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { CellType } from "../constants/CellType.js";
import type { PathCellInfo } from "../constants/PathCellInfo.js";

/**
 * Readonly view of the current level's path and cell-type queries.
 *
 * Controllers, views, and read-only utilities resolve this token.
 * Only {@link import("./GameOperations.js").GameOperations} holds the
 * concrete {@link import("./LevelManager.js").LevelManager} and mutates
 * the level via `generateLevel()`.
 */
export interface ILevelState {
  readonly pathWaypoints: ReadonlyArray<readonly [col: number, row: number]>;
  getPathCellInfo(col: number, row: number): PathCellInfo | null;
  getCellType(col: number, row: number): CellType;
  colorForCellType(type: CellType): number;
}

export const ILevelState = new InjectionToken<ILevelState>("ILevelState");
