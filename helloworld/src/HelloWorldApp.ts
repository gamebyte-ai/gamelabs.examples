import { AssetRequest, AssetTypes, AssetRequestList, GamelabsApp, LogTypes, GameCameraBinding, GameCameraManager, Orbital3dCameraController, UIComponentsBinding, UIEvents } from "@gamebyte/gamelabsjs";

import { CubeView } from "./views/CubeView.three";
import { CubeViewController } from "./controllers/CubeViewController";

import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";

import { TopBarView } from "./views/TopBarView.pixi";
import { TopBarViewController } from "./controllers/TopBarViewController";

import { DebugBarView } from "./views/DebugBarView.pixi";
import { DebugBarViewController } from "./controllers/DebugBarViewController";

import { DebugEvents } from "./events/DebugEvents";
import { GameEvents } from "./events/GameEvents";

import { HelloWorldConfig } from "./HelloWorldConfig";
import { HelloWorldAssetIds } from "./HelloWorldAssetIds";
import { HelloWorldUIIds } from "./HelloWorldUIIds";

export class HelloWorldApp extends GamelabsApp {
  private readonly _assetRequestList = new AssetRequestList();
  private readonly _config = new HelloWorldConfig();
  private readonly _gameEvents = new GameEvents();
  private readonly _debugEvents = new DebugEvents();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _uiComponentsBinding = new UIComponentsBinding();

  private _cubeView: CubeView | null = null;
  private _orbitalController: Orbital3dCameraController | null = null;
  private _cameraManager: GameCameraManager | null = null;

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(HelloWorldConfig, this._config);
    this.diContainer.bindInstance(GameEvents, this._gameEvents);
    this.diContainer.bindInstance(DebugEvents, this._debugEvents);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(HelloWorldUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.register<TopBarView, TopBarViewController>(TopBarView, TopBarViewController);
    this.viewFactory.register<DebugBarView, DebugBarViewController>(DebugBarView, DebugBarViewController);
    this.viewFactory.register<CubeView, CubeViewController>(CubeView, CubeViewController);
  }

  protected override loadAssets(): void {
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.GLTF, HelloWorldAssetIds.Cube, new URL("../assets/cube.glb", import.meta.url).href));
    this.assetManager.loadAll(this._assetRequestList.getRequests());
  }

  protected override postInitialize(): void {
    if (!this.hud || !this.world) {
      this.logger.log("HUD or World is not initialized", LogTypes.Error);
      throw new Error("HUD or World is not initialized");
    }

    // Camera setup
    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._orbitalController = new Orbital3dCameraController(this._cameraManager).register();
    this._orbitalController.minDistance = this._config.minCameraDistance;
    this._orbitalController.maxDistance = this._config.maxCameraDistance;
    this.diContainer.bindInstance(Orbital3dCameraController, this._orbitalController);

    // Screen
    this.diContainer.getInstance(UIEvents).createScreen(HelloWorldUIIds.GameScreen, this._config.transitions.gameScreenEnter);

    // Cube
    this._cubeView = this.viewFactory.createView(CubeView);
    this.world.addView(this._cubeView);
    this._orbitalController.followObject(this._cubeView, 8);

    this.canvas.addEventListener("wheel", this._onOrbitalWheel, { passive: true });
  }

  private readonly _onOrbitalWheel = (e: WheelEvent): void => {
    this._orbitalController?.addDistance(e.deltaY * 0.01);
  };

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    this._cameraManager?.update(timestepSeconds);
  }

  protected override preDestroy(): void {
    this.canvas.removeEventListener("wheel", this._onOrbitalWheel);
    this._orbitalController = null;
    this._cubeView?.destroy();
    this._cubeView = null;
  }
}
