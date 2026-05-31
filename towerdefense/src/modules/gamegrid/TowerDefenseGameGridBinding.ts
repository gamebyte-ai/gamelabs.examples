import { GameGridBinding } from "@gamebyte/gamelabsjs";
import { TowerDefenseConfig } from "../../TowerDefenseConfig.js";
import type { ILevelState } from "../../utilities/ILevelState.js";
import { GameBoardObjectCreator } from "./views/GameBoardObjectCreator.js";
import { GameBoardsView } from "./views/GameBoardsView.three.js";
import { GameBoardsViewController } from "./controllers/GameBoardsViewController.js";

/**
 * Registers the grid model / events and the tower-defense grid view +
 * controller. Takes the readonly {@link ILevelState} so cells can
 * colour themselves and place spawn/base markers based on the current
 * path — mutation lives behind `GameOperations`/`LevelManager`.
 */
export class TowerDefenseGameGridBinding extends GameGridBinding {
  public constructor(config: TowerDefenseConfig, level: ILevelState) {
    super(new GameBoardObjectCreator(config, level), GameBoardsView, GameBoardsViewController);
  }
}
