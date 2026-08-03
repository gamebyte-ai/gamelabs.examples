import { Direction, type LevelDef } from "../constants/GameTypes";

/**
 * Hand-built level definitions (see docs/mechanics-spec.md).
 * Coordinates: col (X) and row (Z), origin top-left (0,0).
 */
export const LEVELS: readonly LevelDef[] = [
  // Level 1 (6x6) - Tutorial: long RED arrow with 2 bends (head UP) + a small arrow.
  // Both have a clear exit ray → solvable in any order. Showcases the snake exit.
  {
    cols: 6,
    rows: 6,
    arrows: [
      // RED (colorIndex 0): 5 cells, 2 bends — down, right→right, down. Head (2,2) UP.
      {
        cells: [
          { col: 2, row: 2 },
          { col: 2, row: 3 },
          { col: 3, row: 3 },
          { col: 4, row: 3 },
          { col: 4, row: 4 },
        ],
        direction: Direction.Up,
        colorIndex: 0,
      },
      // Small arrow (colorIndex 1): head (1,2) UP, tail below. Exits top (col 1 clear).
      { cells: [{ col: 1, row: 2 }, { col: 1, row: 3 }], direction: Direction.Up, colorIndex: 1 },
    ],
  },
  // Level 2 (5x5) - Interlocking: B arrows A's up-ray; must move B first.
  // Order: B(UP) -> A(UP); C(DOWN) any time.
  {
    cols: 5,
    rows: 5,
    arrows: [
      // A: head (2,2) UP, body down. Up-ray passes (2,1) = B's head → blocked until B leaves.
      { cells: [{ col: 2, row: 2 }, { col: 2, row: 3 }], direction: Direction.Up, colorIndex: 0 },
      // B: head (2,1) UP, body right. Up-ray (2,0) clear → slides up first, freeing A.
      { cells: [{ col: 2, row: 1 }, { col: 3, row: 1 }], direction: Direction.Up, colorIndex: 1 },
      // C: head (1,3) DOWN, body up. Down-ray exits bottom → independent.
      { cells: [{ col: 1, row: 3 }, { col: 1, row: 2 }], direction: Direction.Down, colorIndex: 2 },
    ],
  },
  // Level 3 (5x5) - Multi-bend showcase: an S/Z rope + two straight ropes.
  {
    cols: 5,
    rows: 5,
    arrows: [
      // Multi-bend rope: head (1,1) UP; body zig-zags down-right (2 bends). Up-ray (1,0) clear.
      {
        cells: [
          { col: 1, row: 1 },
          { col: 1, row: 2 },
          { col: 2, row: 2 },
          { col: 2, row: 3 },
        ],
        direction: Direction.Up,
        colorIndex: 0,
      },
      // Straight rope: head (3,1) RIGHT, tail left. Exits right edge.
      { cells: [{ col: 3, row: 1 }, { col: 2, row: 1 }], direction: Direction.Right, colorIndex: 3 },
      // Straight rope: head (3,2) RIGHT, tail up. Exits right edge.
      { cells: [{ col: 3, row: 2 }, { col: 3, row: 3 }], direction: Direction.Right, colorIndex: 4 },
    ],
  },
];
