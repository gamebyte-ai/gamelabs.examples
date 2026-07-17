import { vector } from "@js-basics/vector";
import { AssetTypes, GamelabsApp, GameCameraBinding, GameCameraManager, GridsModel, LogTypes, Topdown2dCameraController, UIComponentsBinding, UIEvents, SettingsBinding, SettingsBooleanField, SettingsNumberField, SettingsManager } from "@gamebyte/gamelabsjs";
import { GameModel } from "./models/GameModel.js";
import { IGameModel } from "./models/IGameModel.js";
import { Game2048AssetIds } from "./Game2048AssetIds.js";
import { Game2048Config } from "./Game2048Config.js";
import { Game2048GameGridBinding } from "./modules/gamegrid/Game2048GameGridBinding.js";
import { GameScreenViewController } from "./controllers/GameScreenViewController.js";
import { GameOperations } from "./utilities/GameOperations.js";
import { GameEvents } from "./events/GameEvents.js";
import { GameScreenView } from "./views/GameScreenView.pixi.js";
import { GameBoardsView } from "./modules/gamegrid/views/GameBoardsView.three.js";
import { Game2048UIIds } from "./Game2048UIIds.js";

export class Game2048App extends GamelabsApp {
  private readonly _config = new Game2048Config();
  private readonly _gameGridBinding = new Game2048GameGridBinding();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _settingsBinding = new SettingsBinding();
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  private readonly _gameEvents = new GameEvents();
  private _cameraController: Topdown2dCameraController | null = null;
  private _cameraManager: GameCameraManager | null = null;

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl, configOverridesUrl: "./game-config.json" });
  }

  protected override getOverridableConfig(): object {
    return this._config;
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._gameGridBinding);
    this.addModule(this._settingsBinding);
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(Game2048Config, this._config);
    this.viewDiContainer.bindInstance(Game2048Config, this._config);
    this.diContainer.bindInstance(GameEvents, this._gameEvents);
    this.diContainer.bindInstance(GameModel, new GameModel(), [IGameModel]);
    this.diContainer.bindSingleton(GameOperations, () => new GameOperations());
  }

  protected override loadAssets(): void {
    this.assetManager.load(AssetTypes.Audio, Game2048AssetIds.SfxMove, new URL("../assets/sfx_move.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Game2048AssetIds.SfxMerge, new URL("../assets/sfx_merge.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Game2048AssetIds.SfxInvalid, new URL("../assets/sfx_invalid.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Game2048AssetIds.SfxSpawn, new URL("../assets/sfx_spawn.wav", import.meta.url).href);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(Game2048UIIds.GameScreen, GameScreenView, GameScreenViewController);
  }

  protected override postInitialize(): void {
    if (!this.hud || !this.world) {
      this.logger.log("HUD or world is not initialized", LogTypes.Error);
      throw new Error("HUD or world is not initialized");
    }

    const settings = this.diContainer.getInstance(SettingsManager);
    settings.addField(new SettingsBooleanField("sfx", "Sound Effects", true));
    settings.addField(new SettingsNumberField("sfxVolume", "SFX Volume", 100, 0, 100, 5));

    this.diContainer.getInstance(UIEvents).createScreen(Game2048UIIds.GameScreen, this._config.transitions.gameScreenEnter);
    this.world.addRootView(this.viewFactory.createView(GameBoardsView));

    const grid = this.diContainer.getInstance(GridsModel).getGrid(Game2048Config.GRID_ID);
    if (grid) {
      const offset = grid.getCenterOffset();
      grid.setPosition(vector(-offset.x, -offset.y, -offset.z));
    }
    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Topdown2dCameraController(this._cameraManager).register();
    this._cameraController.followPosition(0, 0, 0);
    this._fitOrthoToBoard(this.width, this.height);
  }

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
    this._fitOrthoToBoard(width, height);
  }

  /** Pick an orthographic size that always leaves `boardMargin` world units
   *  free on every side of the board, in both axes. With aspect = w / h and
   *  ortho conventions `visible_h = orthoSize`, `visible_w = orthoSize * aspect`,
   *  we need both spans to be at least `boardSpan + 2 * margin`. */
  private _fitOrthoToBoard(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    const boardWidth = this._config.cols * this._config.gridColumnSize;
    const boardHeight = this._config.rows * this._config.gridRowSize;
    const requiredW = boardWidth + 2 * this._config.boardMargin;
    const requiredH = boardHeight + 2 * this._config.boardMargin;
    const orthoForHeight = requiredH;
    const orthoForWidth = requiredW / aspect;
    const orthoSize = Math.max(orthoForHeight, orthoForWidth);
    this._cameraManager?.setOrthoSize(orthoSize);
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    this._cameraManager?.update(timestepSeconds);
  }

  protected override preDestroy(): void {
    this._cameraController = null;
    super.preDestroy();
  }
}
