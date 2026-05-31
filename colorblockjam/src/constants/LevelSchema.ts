import type { CellCoord, DoorSide } from "./BoardTypes.js";

/**
 * Descriptor for a block placed on the grid at level start.
 *
 * `shape` is a normalized offset list (min col = min row = 0). `anchor` is
 * the initial grid cell of the shape's origin — the block's absolute cells
 * are `anchor + shape[i]`.
 */
export type BlockDescriptor = {
  readonly id: number;
  readonly colorIndex: number;
  readonly shape: readonly CellCoord[];
  readonly anchor: CellCoord;
};

/**
 * Descriptor for a colored exit on a grid edge.
 *
 * `spanStart`/`spanEnd` are inclusive indices on the perpendicular axis:
 * - top / bottom: column indices (along X),
 * - left / right: row indices (along Z).
 *
 * A block can clear through the door only if its perpendicular span
 * matches the door span exactly, its color matches, and nothing is in
 * the path.
 */
export type DoorDescriptor = {
  readonly id: number;
  readonly side: DoorSide;
  readonly spanStart: number;
  readonly spanEnd: number;
  readonly colorIndex: number;
};

/**
 * All data needed to build a single level. Pure data — no behaviour here,
 * so adding / editing levels is just appending to `ColorBlockJamConfig.levels`.
 */
export type LevelDescriptor = {
  readonly cols: number;
  readonly rows: number;
  readonly blocks: readonly BlockDescriptor[];
  readonly doors: readonly DoorDescriptor[];
};

/** Common shape factories used across level definitions. */
export const SHAPES: {
  readonly square1x1: readonly CellCoord[];
  readonly rect1x2: readonly CellCoord[];
  readonly rect1x3: readonly CellCoord[];
  readonly square2x2: readonly CellCoord[];
  readonly lShape: readonly CellCoord[];
} = {
  square1x1: [{ col: 0, row: 0 }],
  rect1x2: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
  ],
  rect1x3: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
  ],
  square2x2: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ],
  lShape: [
    { col: 0, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ],
};
