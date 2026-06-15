import { GameGridBinding } from "@gamebyte/gamelabsjs";
import type { BlockPuzzleConfig } from "../../BlockPuzzleConfig";
import { GameBoardsViewController } from "./controllers/GameBoardsViewController";
import { GameBoardObjectCreator } from "./views/GameBoardObjectCreator";
import { GameBoardsView } from "./views/GameBoardsView.three";

/**
 * App-side override of the gamegrid binding.
 *
 * - **Creator**: swapped for `GameBoardObjectCreator` so cells render
 *   with the per-surface palette and items render piece-shape blocks.
 * - **View**: swapped for `GameBoardsView` so the world view owns the
 *   drag pipeline (raycast tray pieces, ghost preview, validity
 *   colouring) in addition to the framework's auto-sync.
 * - **Controller**: swapped for `GameBoardsViewController` so item
 *   options carry per-surface cells + the model back-reference, and
 *   `onPiecePlacement` commits via `PiecePlacementOperations`.
 */
export class BlockPuzzleGameGridBinding extends GameGridBinding {
  public constructor(config: BlockPuzzleConfig) {
    super(new GameBoardObjectCreator(config), GameBoardsView, GameBoardsViewController);
  }
}
