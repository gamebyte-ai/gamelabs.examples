import type { GridCoord, IBaseGrid } from "@gamebyte/gamelabsjs";
import type { ClearsResult, IClearRule } from "./IClearRule";

const EMPTY_RESULT: ClearsResult = { cells: [], fullRows: [], fullCols: [] };

/**
 * Full-row / full-column clear rule — the canonical Block Blast /
 * 1010! variant. Any row or column where every cell is occupied
 * after the placement is added to the clear set; cells in both a
 * full row and a full column appear in the cell output once.
 *
 * The `placedCells` parameter serves two purposes at once:
 *
 * - **Which rows/cols to test** — only rows / cols touched by the
 *   placement can have become full, so we don't scan the whole grid.
 * - **Virtual-placement overlay** — `isFilled` treats these cells as
 *   filled even if they aren't yet in the grid model. That makes the
 *   same call work for both the post-placement commit (cells are in
 *   the grid; the overlay is redundant but harmless) and the
 *   pre-placement prediction the view uses for the drag-time
 *   highlight (cells are not yet in the grid; the overlay is what
 *   makes them count as filled for the fullness test).
 *
 * The returned {@link ClearsResult} carries both the cell list (for
 * the view's ghost highlight + the controller's per-cell removal)
 * and the line counts (for the per-line score award).
 */
export class LineClearRule implements IClearRule {
  public computeClears(grid: IBaseGrid, placedCells: readonly GridCoord[]): ClearsResult {
    if (placedCells.length === 0) return EMPTY_RESULT;

    const placedKeys = new Set<string>();
    const rowsToCheck = new Set<number>();
    const colsToCheck = new Set<number>();
    for (const { col, row } of placedCells) {
      placedKeys.add(LineClearRule._key(col, row));
      rowsToCheck.add(row);
      colsToCheck.add(col);
    }

    const isFilled = (col: number, row: number): boolean => {
      if (placedKeys.has(LineClearRule._key(col, row))) return true;
      const cell = grid.getCellSafe(col, row);
      return cell !== null && cell.size > 0;
    };

    const fullRows: number[] = [];
    for (const row of rowsToCheck) {
      if (LineClearRule._isRowFull(grid, row, isFilled)) fullRows.push(row);
    }
    const fullCols: number[] = [];
    for (const col of colsToCheck) {
      if (LineClearRule._isColFull(grid, col, isFilled)) fullCols.push(col);
    }
    if (fullRows.length === 0 && fullCols.length === 0) return EMPTY_RESULT;

    const cells: GridCoord[] = [];
    const seen = new Set<string>();
    for (const row of fullRows) {
      for (let col = 0; col < grid.columnCount; col++) {
        const key = LineClearRule._key(col, row);
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({ col, row });
      }
    }
    for (const col of fullCols) {
      for (let row = 0; row < grid.rowCount; row++) {
        const key = LineClearRule._key(col, row);
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({ col, row });
      }
    }
    return { cells, fullRows, fullCols };
  }

  private static _isRowFull(grid: IBaseGrid, row: number, isFilled: (col: number, row: number) => boolean): boolean {
    for (let col = 0; col < grid.columnCount; col++) {
      if (!isFilled(col, row)) return false;
    }
    return true;
  }

  private static _isColFull(grid: IBaseGrid, col: number, isFilled: (col: number, row: number) => boolean): boolean {
    for (let row = 0; row < grid.rowCount; row++) {
      if (!isFilled(col, row)) return false;
    }
    return true;
  }

  private static _key(col: number, row: number): string {
    return `${col},${row}`;
  }
}
