import { GamelabsApp, UIComponentsBinding, UIEvents, AssetRequest, AssetTypes, AssetRequestList } from "@gamebyte/gamelabsjs";

import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { WinPopupView } from "./views/WinPopupView.pixi";
import { WinPopupViewController } from "./controllers/WinPopupViewController";

import { GameEvents } from "./events/GameEvents";
import { GameModel } from "./models/GameModel";
import { IGameModel } from "./models/IGameModel";
import { WaterSortConfig } from "./WaterSortConfig";
import { WaterSortUIIds } from "./WaterSortUIIds";
import { WaterSortAssetIds } from "./WaterSortAssetIds";
import { GameOperations } from "./utilities/GameOperations";

export class WaterSortApp extends GamelabsApp {
  private readonly _config = new WaterSortConfig();
  private readonly _gameEvents = new GameEvents();
  private readonly _assetRequestList = new AssetRequestList();
  private readonly _uiComponentsBinding = new UIComponentsBinding();

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(WaterSortConfig, this._config);
    this.viewDiContainer.bindInstance(WaterSortConfig, this._config);
    this.diContainer.bindInstance(GameEvents, this._gameEvents);
    this.diContainer.bindInstance(GameModel, new GameModel(), [IGameModel]);
    this.diContainer.bindSingleton(GameOperations, () => new GameOperations());
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(WaterSortUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.registerPopup(WaterSortUIIds.WinPopup, WinPopupView, WinPopupViewController);
  }

  protected override loadAssets(): void {
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.HudTexture, WaterSortAssetIds.Background, new URL("../assets/background.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.HudTexture, WaterSortAssetIds.Bottle, new URL("../assets/bottle.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.HudTexture, WaterSortAssetIds.BottleShine, new URL("../assets/bottle_shine.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.HudTexture, WaterSortAssetIds.Star, new URL("../assets/star.png", import.meta.url).href));
    this.assetManager.loadAll(this._assetRequestList.getRequests());
  }

  protected override postInitialize(): void {
    this.diContainer.getInstance(UIEvents).createScreen(WaterSortUIIds.GameScreen, this._config.transitions.gameScreenEnter);
  }
}
