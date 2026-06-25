import {
  GridCellObjectOptions,
  GridItemObject,
  GridItemObjectOptions,
  GridObjectCreator,
  type IAssetManager,
  type IGridObjectListener,
  type IWorldPointerInput,
} from "@gamebyte/gamelabsjs";
import { TowerDefenseConfig } from "../../../TowerDefenseConfig.js";
import type { ILevelState } from "../../../utilities/ILevelState.js";
import { GameBoardCellObject } from "./GameBoardCellObject.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";
import { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions.js";

/**
 * Creates custom cell and item objects for the tower defense grid.
 * Injects shared config + level handles into every cell so it can
 * determine its visual style.
 */
export class GameBoardObjectCreator extends GridObjectCreator {
  private readonly _config: TowerDefenseConfig;
  private readonly _level: ILevelState;

  public constructor(config: TowerDefenseConfig, level: ILevelState) {
    super();
    this._config = config;
    this._level = level;
  }

  public override createCellObject(
    options: GridCellObjectOptions,
    pointerListener: IGridObjectListener,
    inputManager: IWorldPointerInput | null,
    assetManager?: IAssetManager | null,
  ): GameBoardCellObject {
    const cell = new GameBoardCellObject(options, pointerListener, inputManager, assetManager);
    cell.setEnvironment({ config: this._config, level: this._level });
    return cell;
  }

  public override createItemObject(
    options: GridItemObjectOptions,
    pointerListener: IGridObjectListener,
    inputManager: IWorldPointerInput | null,
    assetManager?: IAssetManager | null,
  ): GridItemObject {
    if (options instanceof GameBoardItemObjectOptions) {
      return new GameBoardItemObject(options, pointerListener, inputManager, assetManager);
    }
    return super.createItemObject(options, pointerListener, inputManager, assetManager);
  }
}
