import { GameGridBinding } from "@gamebyte/gamelabsjs";
import { GameBoardsViewController } from "./controllers/GameBoardsViewController.js";
import { GameBoardObjectCreator } from "./views/GameBoardObjectCreator.js";
import { GameBoardsView } from "./views/GameBoardsView.three.js";

/**
 * Registers gamegrid {@link GridsModel} / {@link GridEvents} and the 2048 world grid view + controller.
 */
export class Game2048GameGridBinding extends GameGridBinding {
  public constructor() {
    super(new GameBoardObjectCreator(), GameBoardsView, GameBoardsViewController);
  }
}
