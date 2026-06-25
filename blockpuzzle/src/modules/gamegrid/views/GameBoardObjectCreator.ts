import type { IAssetManager, IWorldPointerInput } from "@gamebyte/gamelabsjs";
import { GridCellObjectOptions, GridItemObjectOptions, GridObjectCreator, type IGridObjectListener } from "@gamebyte/gamelabsjs";
import type { BlockPuzzleConfig } from "../../../BlockPuzzleConfig";
import { GameBoardCellObject } from "./GameBoardCellObject";
import { GameBoardItemObject } from "./GameBoardItemObject";
import { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions";

/**
 * Dispatches per-surface cell + item visuals.
 *
 * Cells:
 * - Each cell's palette is resolved from `options.gridId` via
 *   `BlockPuzzleConfig.boardKindFor`. Same creator handles the
 *   playing grid and the tray.
 *
 * Items:
 * - The controller threads {@link GameBoardItemObjectOptions} into
 *   this creator, carrying the cells layout (tray = full shape,
 *   grid = single block), the spawn-assigned colour, the per-surface
 *   block size, and a back-reference to the model item for the drag
 *   pipeline.
 */
export class GameBoardObjectCreator extends GridObjectCreator {
  private readonly _config: BlockPuzzleConfig;

  public constructor(config: BlockPuzzleConfig) {
    super();
    this._config = config;
  }

  public override createCellObject(
    options: GridCellObjectOptions,
    pointerListener: IGridObjectListener,
    inputManager: IWorldPointerInput | null,
    assetManager?: IAssetManager | null,
  ): GameBoardCellObject {
    const kind = this._config.boardKindFor(options.gridId);
    const palette = this._config.palettes[kind];
    return new GameBoardCellObject(options, pointerListener, inputManager, assetManager ?? null, palette);
  }

  public override createItemObject(
    options: GridItemObjectOptions,
    pointerListener: IGridObjectListener,
    inputManager: IWorldPointerInput | null,
    assetManager?: IAssetManager | null,
  ): GameBoardItemObject {
    if (!(options instanceof GameBoardItemObjectOptions)) {
      throw new Error("GameBoardObjectCreator: expected GameBoardItemObjectOptions — check GameBoardsViewController.createItemObjectOption");
    }
    return new GameBoardItemObject(options, pointerListener, inputManager, assetManager ?? null);
  }
}
