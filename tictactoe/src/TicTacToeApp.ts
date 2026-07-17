import { GamelabsApp, LogTypes, GameCameraBinding, GameCameraManager, Topdown3dCameraController, UIEvents } from "@gamebyte/gamelabsjs";
import { GameTurnManager, GameTurnManagerToken } from "./utilities/GameTurnManager";
import { TurnEvents } from "./events/TurnEvents";
import { GameModel } from "./models/GameModel";
import { IGameModel } from "./models/IGameModel";
import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { WinPopupView } from "./views/WinPopupView.pixi";
import { WinPopupViewController } from "./controllers/WinPopupViewController";
import { GridOperations } from "./utilities/GridOperations";
import { TicTacToeConfig } from "./TicTacToeConfig";
import { TicTacToeUIIds } from "./TicTacToeUIIds";
import { TicTacToeGameGridBinding } from "./modules/gamegrid/TicTacToeGameGridBinding";
import { GameGridsView } from "./modules/gamegrid/views/GameGridsView.three";

export class TicTacToeApp extends GamelabsApp {
  private readonly _config = new TicTacToeConfig();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _gameGridBinding = new TicTacToeGameGridBinding();
  private _gameGridView: GameGridsView | null = null;
  private _cameraController: Topdown3dCameraController | null = null;
  private _cameraManager: GameCameraManager | null = null;

  constructor(stageEl: HTMLElement) {
    super({ mount: stageEl, configOverridesUrl: "./game-config.json" });
  }

  protected override getOverridableConfig(): object {
    return this._config;
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._gameGridBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(TicTacToeConfig, this._config);
    this.diContainer.bindInstance(GameModel, new GameModel(), [IGameModel]);
    this.diContainer.bindInstance(TurnEvents, new TurnEvents());
    this.diContainer.bindSingleton(GridOperations, () => new GridOperations());
    this.diContainer.bindSingleton(GameTurnManagerToken, () => new GameTurnManager());
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(TicTacToeUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.registerPopup(TicTacToeUIIds.WinPopup, WinPopupView, WinPopupViewController);
  }

  protected override postInitialize(): void {
    if (!this.hud) {
      this.logger.log("HUD is not initialized", LogTypes.Error);
      throw new Error("HUD is not initialized");
    }

    this.diContainer.getInstance(UIEvents).createScreen(TicTacToeUIIds.GameScreen, this._config.transitions.gameScreenEnter);

    if (!this.world) {
      this.logger.log("Three world is not initialized", LogTypes.Error);
      throw new Error("Three world is not initialized");
    }

    const gridOps = this.diContainer.getInstance(GridOperations);
    gridOps.createGrid();
    this._gameGridView = this.viewFactory.createView(GameGridsView);
    this.world.addRootView(this._gameGridView);

    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Topdown3dCameraController(this._cameraManager).register();
    const centerX = (this._config.boardColumnCount - 1) / 2;
    const centerZ = (this._config.boardRowCount - 1) / 2;
    this._cameraController.followPosition(centerX, 0.5, centerZ);
  }

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    this._cameraManager?.update(timestepSeconds);
  }

  protected override preDestroy(): void {
    this._cameraController = null;
    this._gameGridView?.destroy();
    this._gameGridView = null;
  }
}
