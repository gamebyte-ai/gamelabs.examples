import type { HexCoord } from "../constants/HexCoord.js";

/**
 * Packs `(col, row)` into a single number key for use in Sets / Maps.
 *
 * The `* 1000` multiplier supports grids up to 1000 rows; adjust here
 * (not per call-site) if the grid ever grows. Shared by `HexGridView`
 * and `SortingManager` so both use the same packing scheme.
 */
export function hexCellKey(col: number, row: number): number {
  return col * 1000 + row;
}

/**
 * Neighbor offsets for a flat-top hex grid in odd-q offset coordinates.
 *
 * In this layout odd columns are shifted +0.5 row along the row axis (Z).
 * Neighbors therefore depend on the column parity — odd columns pick up
 * `+row` on the east/west diagonals, even columns pick up `-row`.
 *
 * Returns up to six neighbor coordinates per call; callers must still
 * clamp to grid bounds.
 */
export function getHexNeighbors(col: number, row: number): HexCoord[] {
  const isOdd = (col & 1) === 1;
  if (isOdd) {
    return [
      { col, row: row - 1 },
      { col: col + 1, row },
      { col: col + 1, row: row + 1 },
      { col, row: row + 1 },
      { col: col - 1, row: row + 1 },
      { col: col - 1, row },
    ];
  }
  return [
    { col, row: row - 1 },
    { col: col + 1, row: row - 1 },
    { col: col + 1, row },
    { col, row: row + 1 },
    { col: col - 1, row },
    { col: col - 1, row: row - 1 },
  ];
}
