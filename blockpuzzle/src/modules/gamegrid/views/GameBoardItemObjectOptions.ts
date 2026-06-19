import { GridItemObjectOptions, type RectGridPreset } from "@gamebyte/gamelabsjs";
import type { PieceCells } from "../../../BlockPuzzleConfig";
import type { GameBoardItem } from "../models/GameBoardItem";

/**
 * Carries the visual-side data the framework's `GridItemObject`
 * pipeline needs into the rendering layer.
 *
 * The view renders whatever `cells` are passed in — full piece shape
 * in the tray, single block on the playing grid. The controller
 * picks the right list per surface, so the same visual class renders
 * both surfaces without per-surface branching.
 *
 * `modelItem` is the back-reference the drag pipeline needs to
 * recover the originating model item from a tray-piece raycast hit.
 * The visual stashes it on `userData` so the world view can read it
 * back without going through DI.
 */
export class GameBoardItemObjectOptions extends GridItemObjectOptions {
  /** Source-of-truth model item this visual represents. */
  public readonly modelItem: GameBoardItem;
  /** Block layout for this item. For tray items this is the full
   *  piece shape; for grid items it's a single `[[0, 0]]`. */
  public readonly cells: PieceCells;
  /** Block colour for this spawn. Independent of the piece type —
   *  any piece can render in any colour from
   *  `BlockPuzzleConfig.blockColors`. */
  public readonly color: number;
  /** World-space size of one piece-block on the host grid. Differs
   *  per surface (tray uses a smaller value so long pieces fit). */
  public readonly blockSize: number;

  public constructor(
    itemId: number,
    gridPreset: RectGridPreset,
    modelItem: GameBoardItem,
    cells: PieceCells,
    color: number,
    blockSize: number,
  ) {
    super(itemId, gridPreset);
    this.modelItem = modelItem;
    this.cells = cells;
    this.color = color;
    this.blockSize = blockSize;
  }
}
