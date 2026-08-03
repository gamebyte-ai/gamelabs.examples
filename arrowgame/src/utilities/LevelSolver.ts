import { DIRECTION_DELTA } from "../constants/GameTypes";
import type { Cell, LevelDef } from "../constants/GameTypes";

interface SolverArrow {
  cells: Cell[];
  dir: keyof typeof DIRECTION_DELTA;
  removed: boolean;
}

/**
 * Determines whether a level is solvable (every block can eventually exit).
 *
 * A block can slide out iff every cell from its position to the board edge, in
 * its arrow direction, is empty. Removing a block only ever OPENS paths (never
 * arrows one), so a greedy sweep is exact: repeatedly remove any block that can
 * currently slide; if the board empties, the level is solvable. If a full pass
 * removes nothing while arrows remain, it's a deadlock (unsolvable).
 */
export function isLevelSolvable(level: LevelDef): boolean {
  const arrows: SolverArrow[] = level.arrows.map((b) => ({
    cells: b.cells.map((c) => ({ col: c.col, row: c.row })),
    dir: b.direction,
    removed: false,
  }));

  const occupied = (col: number, row: number, exceptIdx: number): boolean =>
    arrows.some(
      (b, i) => !b.removed && i !== exceptIdx && b.cells.some((c) => c.col === col && c.row === row),
    );

  const canSlide = (idx: number): boolean => {
    const b = arrows[idx];
    const head = b.cells[0];
    const d = DIRECTION_DELTA[b.dir];
    let col = head.col + d.col;
    let row = head.row + d.row;
    while (col >= 0 && col < level.cols && row >= 0 && row < level.rows) {
      if (occupied(col, row, idx)) return false;
      col += d.col;
      row += d.row;
    }
    return true;
  };

  let remaining = arrows.length;
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (let i = 0; i < arrows.length; i++) {
      if (!arrows[i].removed && canSlide(i)) {
        arrows[i].removed = true;
        remaining--;
        progressed = true;
      }
    }
  }
  return remaining === 0;
}

/**
 * Validate a set of levels; returns the indices (0-based) of any unsolvable ones.
 * Also flags levels with overlapping arrows or out-of-bounds coordinates.
 */
export function findUnsolvableLevels(levels: readonly LevelDef[]): {
  index: number;
  reason: string;
}[] {
  const problems: { index: number; reason: string }[] = [];
  levels.forEach((level, index) => {
    // Structural checks first (across ALL cells of every block).
    const seen = new Set<string>();
    for (const b of level.arrows) {
      if (!b.cells || b.cells.length < 2) {
        problems.push({ index, reason: `block must have >= 2 cells (got ${b.cells?.length ?? 0})` });
        return;
      }
      for (let i = 0; i < b.cells.length; i++) {
        const c = b.cells[i];
        if (c.col < 0 || c.col >= level.cols || c.row < 0 || c.row >= level.rows) {
          problems.push({ index, reason: `cell out of bounds at (${c.col},${c.row})` });
          return;
        }
        const key = `${c.col},${c.row}`;
        if (seen.has(key)) {
          problems.push({ index, reason: `cells overlap at (${c.col},${c.row})` });
          return;
        }
        seen.add(key);
        // Consecutive cells must be edge-adjacent (connected orthogonal path).
        if (i > 0) {
          const p = b.cells[i - 1];
          const man = Math.abs(c.col - p.col) + Math.abs(c.row - p.row);
          if (man !== 1) {
            problems.push({ index, reason: `block cells not adjacent at (${c.col},${c.row})` });
            return;
          }
        }
      }
    }
    if (!isLevelSolvable(level)) {
      problems.push({ index, reason: "deadlock — no sequence clears the board" });
    }
  });
  return problems;
}
