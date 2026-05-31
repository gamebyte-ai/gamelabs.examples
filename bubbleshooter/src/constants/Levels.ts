import { BubbleColor } from "./BubbleColor";

export interface ILevelCellPlacement {
  readonly row: number;
  readonly col: number;
  readonly color: BubbleColor;
}

export interface ILevelStonePlacement {
  readonly row: number;
  readonly col: number;
}

export interface ILevel {
  readonly id: string;
  readonly label: string;
  /** `null` means "use the deterministic procedural fill"; an array places exactly those cells. */
  readonly placements: readonly ILevelCellPlacement[] | null;
  /** Cells overridden to {@link BubbleColor.Stone} after the colour fill. */
  readonly stoneCells?: readonly ILevelStonePlacement[];
  /**
   * Override the wide-row column count for this level. Even rows hold
   * exactly this many cells; odd rows hold one fewer. The play area
   * width, side-wall positions, and camera fit all derive from it.
   * Omit to use {@link BubbleShooterConfig.wideRowColumns} (the
   * default).
   */
  readonly wideRowColumns?: number;
  /**
   * After the colour fill + stones, randomly overwrite N occupied
   * non-stone cells with {@link BubbleColor.Bomb} and
   * {@link BubbleColor.Fireball}. Cells are picked uniformly without
   * replacement; if the grid has fewer occupied non-stone cells than
   * requested, all eligible cells get overwritten and the rest are
   * skipped silently. Omit to leave a level free of seeded power-ups.
   */
  readonly randomPowerUps?: { readonly bombs: number; readonly fireballs: number };
}

const R = BubbleColor.Red;
const B = BubbleColor.Blue;
const G = BubbleColor.Green;
const Y = BubbleColor.Yellow;
const P = BubbleColor.Purple;
// Empty-cell marker for the 2D arrays handed to `rowsToPlacements`.
// Single-character symbol keeps the level designs readable as a
// pixel-art layout.
const _: null = null;

/**
 * Convert a 2D array (one inner array per model row) into the placement
 * objects the level loader expects. `null` cells are skipped, so a level
 * can leave gaps without listing the empty coords. Each inner array's
 * length must match the layout's per-row column count for that row
 * (8 / 7 alternating for `wideRowColumns: 8`, 12 / 11 for 12, …).
 */
function rowsToPlacements(
  rows: ReadonlyArray<ReadonlyArray<BubbleColor | null>>,
): readonly ILevelCellPlacement[] {
  const placements: ILevelCellPlacement[] = [];
  for (let row = 0; row < rows.length; row++) {
    const cells = rows[row]!;
    for (let col = 0; col < cells.length; col++) {
      const color = cells[col];
      if (color === null) continue;
      placements.push({ row, col, color });
    }
  }
  return placements;
}

/**
 * Test levels for the development dropdown. Level 1 is the standard
 * procedural fill; Levels 2–5 are hand-crafted designs that exercise
 * the wide-row count override across the supported range (8 → 12) and
 * cover dense, banded, wave, and sparse-cluster layouts. Every level
 * with a hand-crafted layout seeds at least 2 bombs + 2 fireballs as
 * harvestable power-ups; the auto-positioning rule pins the cluster's
 * lowest row to the standard starting distance from the shooter.
 */
export const LEVELS: readonly ILevel[] = [
  {
    id: "level-1",
    label: "Level 1",
    placements: null,
    // Four stones scattered through the procedural fill so the player
    // sees how they survive matches and only clear via the
    // disconnect-and-fall path.
    stoneCells: [
      { row: 2, col: 3 },
      { row: 4, col: 7 },
      { row: 6, col: 5 },
      { row: 9, col: 8 },
    ],
    // Seed the level with a couple of harvestable power-ups so the
    // player can experience the collection mechanic on the very
    // first shot — ahead of the inventory starting at 1 each.
    randomPowerUps: { bombs: 2, fireballs: 1 },
  },
  {
    id: "level-2",
    label: "Level 2 — Mosaic",
    // Narrowest of the hand-crafted set — 8 cells per wide row.
    // Diagonal colour cascade: each row shifts one step through the
    // palette so cluster pops chain naturally with neighbouring
    // rows. 10 rows, fully dense (~75 occupied cells).
    wideRowColumns: 8,
    placements: rowsToPlacements([
      [R, B, G, Y, P, R, B, G],
      [B, G, Y, P, R, B, G],
      [G, Y, P, R, B, G, Y, P],
      [Y, P, R, B, G, Y, P],
      [P, R, B, G, Y, P, R, B],
      [R, B, G, Y, P, R, B],
      [B, G, Y, P, R, B, G, Y],
      [G, Y, P, R, B, G, Y],
      [Y, P, R, B, G, Y, P, R],
      [P, R, B, G, Y, P, R],
    ]),
    randomPowerUps: { bombs: 2, fireballs: 2 },
  },
  {
    id: "level-3",
    label: "Level 3 — Bands",
    // Width 10. Horizontal mono-colour bands — a single shot at any
    // row clears most of that row at once. Five colours cycle through
    // 10 rows for a "score-rush" feel (~95 occupied cells).
    wideRowColumns: 10,
    placements: rowsToPlacements([
      [R, R, R, R, R, R, R, R, R, R],
      [B, B, B, B, B, B, B, B, B],
      [G, G, G, G, G, G, G, G, G, G],
      [Y, Y, Y, Y, Y, Y, Y, Y, Y],
      [P, P, P, P, P, P, P, P, P, P],
      [R, R, R, R, R, R, R, R, R],
      [B, B, B, B, B, B, B, B, B, B],
      [G, G, G, G, G, G, G, G, G],
      [Y, Y, Y, Y, Y, Y, Y, Y, Y, Y],
      [P, P, P, P, P, P, P, P, P],
    ]),
    randomPowerUps: { bombs: 2, fireballs: 2 },
  },
  {
    id: "level-4",
    label: "Level 4 — Wave",
    // Widest grid in the set — 12 cells per wide row. Diagonal colour
    // wave: each row slides the palette one cell to the left so the
    // bands flow as a smooth diagonal across the play area. 10 rows,
    // fully dense (~115 occupied cells).
    wideRowColumns: 12,
    placements: rowsToPlacements([
      [R, R, R, B, B, B, G, G, G, Y, Y, Y],
      [R, R, B, B, B, G, G, G, Y, Y, Y],
      [R, B, B, B, G, G, G, Y, Y, Y, P, P],
      [B, B, B, G, G, G, Y, Y, Y, P, P],
      [B, B, G, G, G, Y, Y, Y, P, P, P, R],
      [B, G, G, G, Y, Y, Y, P, P, P, R],
      [G, G, G, Y, Y, Y, P, P, P, R, R, B],
      [G, G, Y, Y, Y, P, P, P, R, R, B],
      [G, Y, Y, Y, P, P, P, R, R, B, B, B],
      [Y, Y, Y, P, P, P, R, R, B, B, B],
    ]),
    randomPowerUps: { bombs: 2, fireballs: 2 },
  },
  {
    id: "level-5",
    label: "Level 5 — Lattice",
    // Width 11. A dense top + bottom block sandwiches a middle band
    // with intentional interior pockets. Every cell traces back to
    // row 0 via the fully-occupied top three rows and the dense outer
    // columns that frame the windows — connected structure with
    // visible voids rather than floating clusters. 10 rows
    // (~90 occupied cells).
    wideRowColumns: 11,
    placements: rowsToPlacements([
      [R, R, B, B, G, G, Y, Y, P, P, R],
      [R, B, B, G, G, Y, Y, P, P, R],
      [B, B, G, G, Y, Y, P, P, R, R, B],
      [B, G, G, _, _, _, R, R, B, B],
      [G, G, Y, _, _, _, _, B, B, B, G],
      [G, Y, Y, _, _, _, _, B, G, G],
      [Y, Y, P, _, _, _, _, B, G, G, Y],
      [Y, P, P, R, R, B, B, G, G, Y],
      [P, P, R, R, B, B, G, G, Y, Y, P],
      [P, R, R, B, B, G, G, Y, Y, P],
    ]),
    randomPowerUps: { bombs: 2, fireballs: 2 },
  },
];
