import { GridItem } from "@gamebyte/gamelabsjs";
import type { PieceCells, PieceType } from "../../../BlockPuzzleConfig";

/**
 * Per-board item model: one `GridItem` per piece (tray) or per
 * block (grid), carrying:
 *
 * - `pieceType` — catalog identity (kept on grid items too so future
 *   clear rules can match by piece type or group).
 * - `cells` — the **rendered** shape for this specific item. Tray
 *   items hold a fully-rotated variant from
 *   `BlockPuzzleConfig.rotatedShapes`; grid items hold `[[0, 0]]`
 *   (single block).
 * - `color` — the spawn-assigned block colour. Independent of the
 *   piece type so every piece can appear in any palette colour.
 *
 * Both the spawner and the placement op write `cells` directly; the
 * view renders `item.cells` without per-surface branching.
 */
export class GameBoardItem extends GridItem {
  public readonly pieceType: PieceType;
  public readonly cells: PieceCells;
  public readonly color: number;

  public constructor(itemId: number, pieceType: PieceType, cells: PieceCells, color: number) {
    super(itemId);
    this.pieceType = pieceType;
    this.cells = cells;
    this.color = color;
  }
}
