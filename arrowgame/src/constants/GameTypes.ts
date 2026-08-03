export enum Direction {
  Up = "UP",
  Down = "DOWN",
  Left = "LEFT",
  Right = "RIGHT",
}

/**
 * Delta in grid coordinates (col, row) for each slide direction.
 * Grid is on the XZ plane: col -> X, row -> Z.
 * Up = row decreases (Z-), Down = row increases (Z+), Left = col decreases (X-), Right = col increases (X+).
 */
export const DIRECTION_DELTA: Record<Direction, { col: number; row: number }> = {
  [Direction.Up]: { col: 0, row: -1 },
  [Direction.Down]: { col: 0, row: 1 },
  [Direction.Left]: { col: -1, row: 0 },
  [Direction.Right]: { col: 1, row: 0 },
};

/** Yaw rotation (radians) applied to the UP arrow texture to point it in each direction. */
export const DIRECTION_ARROW_ROTATION: Record<Direction, number> = {
  [Direction.Up]: 0,
  [Direction.Right]: -Math.PI / 2,
  [Direction.Down]: Math.PI,
  [Direction.Left]: Math.PI / 2,
};

/** A single grid cell (col = X, row = Z). */
export interface Cell {
  col: number;
  row: number;
}

export interface ArrowDef {
  /**
   * Ordered path of cells forming the block, [head, ..., tail]. A connected
   * orthogonal chain (each consecutive pair is edge-adjacent), length >= 2. The
   * HEAD (cells[0]) carries the arrow and leads when the block slides — the body
   * follows through the head's cells like a rope/snake. May bend (L / multi-bend).
   */
  cells: Cell[];
  direction: Direction;
  /** Index into the config color palette. */
  colorIndex: number;
}

export interface LevelDef {
  cols: number;
  rows: number;
  arrows: ArrowDef[];
}
