import { Direction, type LevelDef } from "../constants/GameTypes";

/**
 * Hand-built level definitions (see docs/mechanics-spec.md).
 * Coordinates: col (X) and row (Z), origin top-left (0,0).
 */
export const LEVELS: readonly LevelDef[] = [
  // Level 1 (8x8) - Tutorial: 6 arrows, all 4 directions. Five have a clear exit
  // ray; the long bent RED arrow (a0) waits behind a small blocker (a1) in its
  // up-lane. Move the blocker, then everything clears. Verified solvable.
  {
    cols: 8,
    rows: 8,
    arrows: [
      // RED (colorIndex 0): 4 cells, 1 bend (down → right → down). Head (3,3) UP;
      // its up-lane is blocked by a1 at (3,1) until that one leaves.
      {
        cells: [
          { col: 3, row: 3 },
          { col: 3, row: 4 },
          { col: 4, row: 4 },
          { col: 4, row: 5 },
        ],
        direction: Direction.Up,
        colorIndex: 0,
      },
      // Blocker (colorIndex 1): head (3,1) UP sits in RED's up-ray; own up-ray
      // (3,0) is clear → slides up first, freeing RED.
      { cells: [{ col: 3, row: 1 }, { col: 4, row: 1 }], direction: Direction.Up, colorIndex: 1 },
      // Small arrow (colorIndex 2): head (1,2) UP, tail below. Exits top.
      { cells: [{ col: 1, row: 2 }, { col: 1, row: 3 }], direction: Direction.Up, colorIndex: 2 },
      // L-bend (colorIndex 3): head (1,6) LEFT → exits left edge. Independent.
      { cells: [{ col: 1, row: 6 }, { col: 2, row: 6 }, { col: 2, row: 5 }], direction: Direction.Left, colorIndex: 3 },
      // Straight (colorIndex 4): head (5,2) RIGHT, tail down. Exits right edge.
      { cells: [{ col: 5, row: 2 }, { col: 5, row: 3 }], direction: Direction.Right, colorIndex: 4 },
      // Straight (colorIndex 0): head (6,5) DOWN, tail up. Exits bottom edge.
      { cells: [{ col: 6, row: 5 }, { col: 6, row: 4 }], direction: Direction.Down, colorIndex: 0 },
    ],
  },
  // Level 2 (9x9) - HARD: 24 interlocking arrows, all 4 directions, 15 bent
  // ropes, 73/81 cells used. Because removing an arrow only ever OPENS paths, you
  // can never get stuck — the challenge is that almost every step has just ONE
  // movable arrow (18-deep forced chain: movable-per-step 2,1,1,1,1,1,1,1,2,1,2,
  // 1,1,2,1,2,2,1), so you must scan the whole board each turn to find the single
  // arrow with a clear lane. Machine-generated + verified: fully connected, no
  // overlap, no head-into-self, no edge-flush, greedy-solvable.
  {
    cols: 9,
    rows: 9,
    arrows: [
      { cells: [{ col: 4, row: 6 }, { col: 5, row: 6 }, { col: 5, row: 7 }, { col: 6, row: 7 }], direction: Direction.Up, colorIndex: 0 },
      { cells: [{ col: 6, row: 0 }, { col: 7, row: 0 }, { col: 8, row: 0 }], direction: Direction.Left, colorIndex: 1 },
      { cells: [{ col: 2, row: 0 }, { col: 2, row: 1 }, { col: 3, row: 1 }], direction: Direction.Left, colorIndex: 2 },
      { cells: [{ col: 4, row: 3 }, { col: 5, row: 3 }, { col: 6, row: 3 }, { col: 6, row: 4 }], direction: Direction.Left, colorIndex: 3 },
      { cells: [{ col: 8, row: 6 }, { col: 7, row: 6 }, { col: 6, row: 6 }, { col: 6, row: 5 }], direction: Direction.Right, colorIndex: 4 },
      { cells: [{ col: 2, row: 2 }, { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 3, row: 4 }], direction: Direction.Right, colorIndex: 0 },
      { cells: [{ col: 1, row: 8 }, { col: 2, row: 8 }, { col: 3, row: 8 }], direction: Direction.Left, colorIndex: 1 },
      { cells: [{ col: 1, row: 6 }, { col: 0, row: 6 }], direction: Direction.Down, colorIndex: 2 },
      { cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 1, row: 2 }], direction: Direction.Down, colorIndex: 3 },
      { cells: [{ col: 7, row: 2 }, { col: 7, row: 3 }], direction: Direction.Up, colorIndex: 4 },
      { cells: [{ col: 1, row: 3 }, { col: 0, row: 3 }, { col: 0, row: 2 }], direction: Direction.Down, colorIndex: 0 },
      { cells: [{ col: 8, row: 4 }, { col: 8, row: 5 }, { col: 7, row: 5 }], direction: Direction.Up, colorIndex: 1 },
      { cells: [{ col: 5, row: 0 }, { col: 5, row: 1 }, { col: 4, row: 1 }], direction: Direction.Left, colorIndex: 2 },
      { cells: [{ col: 4, row: 5 }, { col: 4, row: 4 }, { col: 5, row: 4 }, { col: 5, row: 5 }], direction: Direction.Left, colorIndex: 3 },
      { cells: [{ col: 0, row: 8 }, { col: 0, row: 7 }, { col: 1, row: 7 }], direction: Direction.Down, colorIndex: 4 },
      { cells: [{ col: 6, row: 2 }, { col: 5, row: 2 }], direction: Direction.Right, colorIndex: 0 },
      { cells: [{ col: 8, row: 7 }, { col: 7, row: 7 }], direction: Direction.Down, colorIndex: 1 },
      { cells: [{ col: 3, row: 5 }, { col: 3, row: 6 }, { col: 3, row: 7 }, { col: 2, row: 7 }], direction: Direction.Left, colorIndex: 2 },
      { cells: [{ col: 0, row: 4 }, { col: 1, row: 4 }, { col: 1, row: 5 }], direction: Direction.Down, colorIndex: 3 },
      { cells: [{ col: 4, row: 7 }, { col: 4, row: 8 }, { col: 5, row: 8 }], direction: Direction.Left, colorIndex: 4 },
      { cells: [{ col: 7, row: 1 }, { col: 8, row: 1 }, { col: 8, row: 2 }], direction: Direction.Up, colorIndex: 0 },
      { cells: [{ col: 6, row: 8 }, { col: 7, row: 8 }, { col: 8, row: 8 }], direction: Direction.Left, colorIndex: 1 },
      { cells: [{ col: 4, row: 2 }, { col: 3, row: 2 }], direction: Direction.Up, colorIndex: 2 },
      { cells: [{ col: 2, row: 5 }, { col: 2, row: 6 }], direction: Direction.Up, colorIndex: 3 },
    ],
  },
  // Level 3 (10x14) - HARD (test level): 36 interlocking arrows, all 4 directions,
  // 16 bent ropes, 101/140 cells used. 13-deep dependency chain (movable-per-step
  // 11,7,5,2,2,1,1,2,1,1,1,1,1) with several forced single-move steps. Machine-
  // generated by reverse-order construction (each arrow's exit lane was clear of
  // the already-placed arrows), which mathematically guarantees a valid solve;
  // verified: connected, no overlap, no head-into-self, no edge-flush, solvable.
  {
    cols: 10,
    rows: 14,
    arrows: [
      { cells: [{ col: 6, row: 7 }, { col: 7, row: 7 }, { col: 7, row: 6 }, { col: 8, row: 6 }], direction: Direction.Up, colorIndex: 0 },
      { cells: [{ col: 6, row: 2 }, { col: 6, row: 1 }], direction: Direction.Right, colorIndex: 1 },
      { cells: [{ col: 7, row: 0 }, { col: 7, row: 1 }, { col: 7, row: 2 }, { col: 8, row: 2 }], direction: Direction.Left, colorIndex: 2 },
      { cells: [{ col: 3, row: 1 }, { col: 3, row: 0 }, { col: 4, row: 0 }, { col: 5, row: 0 }], direction: Direction.Down, colorIndex: 3 },
      { cells: [{ col: 3, row: 3 }, { col: 4, row: 3 }, { col: 4, row: 2 }], direction: Direction.Down, colorIndex: 4 },
      { cells: [{ col: 4, row: 7 }, { col: 3, row: 7 }, { col: 2, row: 7 }, { col: 2, row: 8 }], direction: Direction.Down, colorIndex: 0 },
      { cells: [{ col: 9, row: 10 }, { col: 9, row: 11 }, { col: 8, row: 11 }], direction: Direction.Left, colorIndex: 1 },
      { cells: [{ col: 4, row: 10 }, { col: 4, row: 11 }], direction: Direction.Left, colorIndex: 2 },
      { cells: [{ col: 1, row: 10 }, { col: 2, row: 10 }], direction: Direction.Up, colorIndex: 3 },
      { cells: [{ col: 0, row: 5 }, { col: 1, row: 5 }], direction: Direction.Up, colorIndex: 4 },
      { cells: [{ col: 6, row: 13 }, { col: 6, row: 12 }, { col: 5, row: 12 }, { col: 4, row: 12 }], direction: Direction.Left, colorIndex: 0 },
      { cells: [{ col: 6, row: 3 }, { col: 5, row: 3 }], direction: Direction.Right, colorIndex: 1 },
      { cells: [{ col: 2, row: 2 }, { col: 1, row: 2 }, { col: 1, row: 3 }], direction: Direction.Up, colorIndex: 2 },
      { cells: [{ col: 2, row: 1 }, { col: 1, row: 1 }, { col: 0, row: 1 }], direction: Direction.Up, colorIndex: 3 },
      { cells: [{ col: 2, row: 9 }, { col: 1, row: 9 }], direction: Direction.Right, colorIndex: 4 },
      { cells: [{ col: 9, row: 8 }, { col: 8, row: 8 }], direction: Direction.Up, colorIndex: 0 },
      { cells: [{ col: 1, row: 4 }, { col: 0, row: 4 }, { col: 0, row: 3 }, { col: 0, row: 2 }], direction: Direction.Right, colorIndex: 1 },
      { cells: [{ col: 3, row: 4 }, { col: 2, row: 4 }, { col: 2, row: 5 }, { col: 2, row: 6 }], direction: Direction.Right, colorIndex: 2 },
      { cells: [{ col: 9, row: 1 }, { col: 9, row: 2 }], direction: Direction.Up, colorIndex: 3 },
      { cells: [{ col: 6, row: 4 }, { col: 6, row: 5 }], direction: Direction.Right, colorIndex: 4 },
      { cells: [{ col: 6, row: 9 }, { col: 6, row: 8 }], direction: Direction.Right, colorIndex: 0 },
      { cells: [{ col: 3, row: 13 }, { col: 3, row: 12 }, { col: 3, row: 11 }, { col: 3, row: 10 }], direction: Direction.Left, colorIndex: 1 },
      { cells: [{ col: 0, row: 8 }, { col: 1, row: 8 }, { col: 1, row: 7 }], direction: Direction.Down, colorIndex: 2 },
      { cells: [{ col: 0, row: 13 }, { col: 0, row: 12 }], direction: Direction.Down, colorIndex: 3 },
      { cells: [{ col: 7, row: 11 }, { col: 7, row: 10 }, { col: 7, row: 9 }], direction: Direction.Down, colorIndex: 4 },
      { cells: [{ col: 7, row: 13 }, { col: 7, row: 12 }, { col: 8, row: 12 }], direction: Direction.Right, colorIndex: 0 },
      { cells: [{ col: 9, row: 9 }, { col: 8, row: 9 }, { col: 8, row: 10 }], direction: Direction.Right, colorIndex: 1 },
      { cells: [{ col: 0, row: 11 }, { col: 1, row: 11 }, { col: 1, row: 12 }, { col: 1, row: 13 }], direction: Direction.Left, colorIndex: 2 },
      { cells: [{ col: 9, row: 0 }, { col: 8, row: 0 }, { col: 8, row: 1 }], direction: Direction.Right, colorIndex: 3 },
      { cells: [{ col: 8, row: 4 }, { col: 8, row: 3 }], direction: Direction.Right, colorIndex: 4 },
      { cells: [{ col: 2, row: 13 }, { col: 2, row: 12 }, { col: 2, row: 11 }], direction: Direction.Down, colorIndex: 0 },
      { cells: [{ col: 9, row: 7 }, { col: 8, row: 7 }], direction: Direction.Right, colorIndex: 1 },
      { cells: [{ col: 9, row: 13 }, { col: 8, row: 13 }], direction: Direction.Right, colorIndex: 2 },
      { cells: [{ col: 8, row: 5 }, { col: 7, row: 5 }, { col: 7, row: 4 }], direction: Direction.Right, colorIndex: 3 },
      { cells: [{ col: 1, row: 0 }, { col: 2, row: 0 }], direction: Direction.Left, colorIndex: 4 },
      { cells: [{ col: 0, row: 6 }, { col: 1, row: 6 }], direction: Direction.Left, colorIndex: 0 },
    ],
  },
];
