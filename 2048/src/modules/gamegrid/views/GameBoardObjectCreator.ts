import type { IAssetManager, IInputManager } from "@gamebyte/gamelabsjs";
import { GridCellObjectOptions, GridObjectCreator, GridItemObjectOptions, type IGridObjectListener } from "@gamebyte/gamelabsjs";
import { GameBoardCellObject } from "./GameBoardCellObject.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";
import type { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions.js";

export class GameBoardObjectCreator extends GridObjectCreator {
  public override createCellObject(options: GridCellObjectOptions, pointerListener: IGridObjectListener, inputManager: IInputManager | null, assetManager?: IAssetManager | null): GameBoardCellObject {
    return new GameBoardCellObject(options, pointerListener, inputManager, assetManager);
  }

  public override createItemObject(options: GridItemObjectOptions, pointerListener: IGridObjectListener, inputManager: IInputManager | null, assetManager?: IAssetManager | null): GameBoardItemObject {
    return new GameBoardItemObject(options as GameBoardItemObjectOptions, pointerListener, inputManager, assetManager);
  }
}
