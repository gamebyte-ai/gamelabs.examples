import { vector } from "@js-basics/vector";
import { AssetTypes, GamelabsApp, GameCameraBinding, GameCameraManager, GridsModel, LogTypes, Topdown2dCameraController, UIComponentsBinding, UIEvents, SettingsBinding, SettingsBooleanField, SettingsNumberField, SettingsManager } from "@gamebyte/gamelabsjs";
import { Match3AssetIds } from "./Match3AssetIds.js";
import { Match3Config } from "./Match3Config.js";
import { Match3GameGridBinding } from "./modules/gamegrid/Match3GameGridBinding.js";
import { GameScreenViewController } from "./controllers/GameScreenViewController.js";
import { GameOperations } from "./utilities/GameOperations.js";
import { GameEvents } from "./events/GameEvents.js";
import { GameModel } from "./models/GameModel.js";
import { IGameModel } from "./models/IGameModel.js";
import { GameScreenView } from "./views/GameScreenView.pixi.js";
import { GameBoardsView } from "./modules/gamegrid/views/GameBoardsView.three.js";
import { Match3UIIds } from "./Match3UIIds.js";

export class Match3App extends GamelabsApp {
  private readonly _config = new Match3Config();
  private readonly _gameGridBinding = new Match3GameGridBinding();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _settingsBinding = new SettingsBinding();
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  private readonly _gameEvents = new GameEvents();
  private _cameraController: Topdown2dCameraController | null = null;
  private _cameraManager: GameCameraManager | null = null;

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._gameGridBinding);
    this.addModule(this._settingsBinding);
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(Match3Config, this._config);
    this.viewDiContainer.bindInstance(Match3Config, this._config);
    this.diContainer.bindInstance(GameEvents, this._gameEvents);
    this.diContainer.bindInstance(GameModel, new GameModel(), [IGameModel]);
    this.diContainer.bindSingleton(GameOperations, () => new GameOperations());
  }

  protected override loadAssets(): void {
    this.assetManager.load(AssetTypes.WorldTexture, Match3AssetIds.GemRed, new URL("../assets/gem_red.svg", import.meta.url).href);
    this.assetManager.load(AssetTypes.WorldTexture, Match3AssetIds.GemBlue, new URL("../assets/gem_blue.svg", import.meta.url).href);
    this.assetManager.load(AssetTypes.WorldTexture, Match3AssetIds.GemGreen, new URL("../assets/gem_green.svg", import.meta.url).href);
    this.assetManager.load(AssetTypes.WorldTexture, Match3AssetIds.GemYellow, new URL("../assets/gem_yellow.svg", import.meta.url).href);
    this.assetManager.load(AssetTypes.WorldTexture, Match3AssetIds.GemPurple, new URL("../assets/gem_purple.svg", import.meta.url).href);

    // Audio
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxSelect, new URL("../assets/sfx_select.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxSwap, new URL("../assets/sfx_swap.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxWrong, new URL("../assets/sfx_wrong.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxPop, new URL("../assets/sfx_pop.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.MusicBg, new URL("../assets/music_bg.wav", import.meta.url).href);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(Match3UIIds.GameScreen, GameScreenView, GameScreenViewController);
  }

  protected override postInitialize(): void {
    if (!this.hud || !this.world) {
      this.logger.log("HUD or world is not initialized", LogTypes.Error);
      throw new Error("HUD or world is not initialized");
    }

    const settings = this.diContainer.getInstance(SettingsManager);
    settings.addField(new SettingsBooleanField("music", "Music", true));
    settings.addField(new SettingsBooleanField("sfx", "Sound Effects", true));
    settings.addField(new SettingsNumberField("musicVolume", "Music Volume", 70, 0, 100, 5));
    settings.addField(new SettingsNumberField("sfxVolume", "SFX Volume", 100, 0, 100, 5));

    this.diContainer.getInstance(UIEvents).createScreen(Match3UIIds.GameScreen, this._config.transitions.gameScreenEnter);
    this.world.addRootView(this.viewFactory.createView(GameBoardsView));

    const grid = this.diContainer.getInstance(GridsModel).getGrid(Match3Config.GRID_ID);
    if (grid) {
      const offset = grid.getCenterOffset();
      grid.setPosition(vector(-offset.x, -offset.y, -offset.z));
    }
    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Topdown2dCameraController(this._cameraManager).register();
    this._cameraManager.setOrthoSize(this._config.cameraOrthoSize);
    this._cameraController.followPosition(0, 0, 0);
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
    super.preDestroy();
  }
}
