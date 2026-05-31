import {
  GamelabsApp,
  UIEvents,
  AssetRequest,
  AssetTypes,
  AssetRequestList,
  GameCameraBinding,
  GameCameraManager,
  CameraShakeTrack,
  Topdown2dCameraController,
  OnScreenControlsBinding,
  OnScreenControlManager,
  ControlAnchor,
  ControlType,
  OscStyleIds,
  type OscButtonStyle,
  ParticleManager,
  ParticlesBinding,
  StyleManager,
  TimelineBinding,
  TimelineManager,
  UIComponentsBinding,
} from "@gamebyte/gamelabsjs";

import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { GameAreaView } from "./views/GameAreaView.three";
import { GameAreaViewController } from "./controllers/GameAreaViewController";
import { GameOverPopupView } from "./views/GameOverPopupView.pixi";
import { GameOverPopupViewController } from "./controllers/GameOverPopupViewController";

import { GameEvents } from "./events/GameEvents";
import { GameModel } from "./models/GameModel";
import { IGameModel } from "./models/IGameModel";
import { WaveManager } from "./utilities/WaveManager";
import { GameOperations } from "./utilities/GameOperations";
import { PlayerInputManager } from "./utilities/PlayerInputManager";
import { AvoidanceConfig } from "./AvoidanceConfig";
import { AvoidanceAssetIds } from "./AvoidanceAssetIds";
import { AvoidanceUIIds } from "./AvoidanceUIIds";

export class AvoidanceApp extends GamelabsApp {
  private readonly _config = new AvoidanceConfig();
  private readonly _assetRequestList = new AssetRequestList();
  private readonly _gameEvents = new GameEvents();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _timelineBinding = new TimelineBinding();
  private readonly _particlesBinding = new ParticlesBinding();
  private readonly _onScreenControlsBinding = new OnScreenControlsBinding();
  // UIComponentsBinding ships the framework default Button skin asset
  // requests + style entry — `GameOverPopupView` resolves
  // `UIComponentsStyleIds.Button` for its "Play Again" button, so the
  // binding has to be registered before the popup mounts.
  private readonly _uiComponentsBinding = new UIComponentsBinding();

  private _gameAreaView: GameAreaView | null = null;
  private _cameraController: Topdown2dCameraController | null = null;
  private _cameraManager: GameCameraManager | null = null;
  private _timelineManager: TimelineManager | null = null;
  private _particleManager: ParticleManager | null = null;

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._timelineBinding);
    this.addModule(this._particlesBinding);
    this.addModule(this._onScreenControlsBinding);
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(AvoidanceConfig, this._config);
    this.viewDiContainer.bindInstance(AvoidanceConfig, this._config);
    this.diContainer.bindInstance(GameEvents, this._gameEvents);
    this.diContainer.bindInstance(GameModel, new GameModel(), [IGameModel]);
    this.diContainer.bindSingleton(WaveManager, () => new WaveManager());
    this.diContainer.bindSingleton(GameOperations, () => new GameOperations());

    // Re-theme on-screen buttons to the avoidance green palette before
    // any control is registered. The view picks this up the first time
    // it renders the slow button.
    this.viewDiContainer.getInstance(StyleManager).modify<OscButtonStyle>(OscStyleIds.Button, {
      up: { color: 0x44cc66, alpha: 0.85 },
      down: { color: 0x88ee88, alpha: 0.95 },
    });

    // HUD chrome — wave counter (top-left, always visible) and the
    // big "WAVE N" announce text (centred, hidden until a wave starts).
    // Content is driven from `GameScreenViewController` via the manager.
    const osc = this.diContainer.getInstance(OnScreenControlManager);
    osc.addControl({
      type: ControlType.Label,
      id: "wave",
      anchor: ControlAnchor.TopLeft,
      offsetX: 16,
      offsetY: 16,
      content: "WAVE 1",
      text: { color: 0x88cc88, fontSize: 18, fontWeight: "600" },
    });
    osc.addControl({
      type: ControlType.Label,
      id: "waveAnnounce",
      anchor: ControlAnchor.Center,
      offsetX: 0,
      offsetY: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      content: "",
      text: { color: 0xccffcc, fontSize: 48, fontWeight: "800" },
    });
    osc.setControlVisible("waveAnnounce", false);

    const playerInput = new PlayerInputManager();
    playerInput.inject(this.diContainer);

    this._timelineManager = this.diContainer.getInstance(TimelineManager);
    this._particleManager = this.diContainer.getInstance(ParticleManager);
    const camera = this.diContainer.getInstance(GameCameraManager);
    this._gameEvents.onGameOver(() =>
      this._timelineManager?.add(
        new CameraShakeTrack(camera, {
          amplitude: this._config.cameraShakeAmplitude,
          duration: this._config.cameraShakeDurationMs / 1000,
        }),
      ),
    );
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(AvoidanceUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.registerPopup(AvoidanceUIIds.GameOverPopup, GameOverPopupView, GameOverPopupViewController);
    this.viewFactory.register(GameAreaView, GameAreaViewController);
  }

  protected override loadAssets(): void {
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, AvoidanceAssetIds.Background, new URL("../assets/background.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, AvoidanceAssetIds.Player, new URL("../assets/player.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, AvoidanceAssetIds.Enemy, new URL("../assets/enemy.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.HudTexture, AvoidanceAssetIds.SlowIcon, new URL("../assets/slow-icon.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, AvoidanceAssetIds.ParticleSoft, new URL("../assets/particle-soft.png", import.meta.url).href));
    this._assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, AvoidanceAssetIds.ParticleSpark, new URL("../assets/particle-spark.png", import.meta.url).href));
    this.assetManager.loadAll(this._assetRequestList.getRequests());
  }

  protected override postInitialize(): void {
    if (!this.world || !this.hud) throw new Error("World or HUD is not initialized");

    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Topdown2dCameraController(this._cameraManager).register();
    const half = this._config.gameAreaSize / 2;
    this._cameraController.followPosition(half, 0, half);
    this._fitCamera(this.width, this.height);

    this._gameAreaView = this.viewFactory.createView(GameAreaView);
    this.world.addView(this._gameAreaView);

    this.diContainer.getInstance(UIEvents).createScreen(AvoidanceUIIds.GameScreen, this._config.transitions.gameScreenEnter);
  }

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
    this._fitCamera(width, height);
  }

  private _fitCamera(screenWidth: number, screenHeight: number): void {
    const margin = 1.2;
    const areaSize = this._config.gameAreaSize * margin;
    const aspect = Math.max(0.01, screenWidth) / Math.max(0.01, screenHeight);
    const orthoSize = aspect < 1 ? areaSize / aspect : areaSize;
    this._cameraManager?.setOrthoSize(orthoSize);
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    this._timelineManager?.update(timestepSeconds);
    this._cameraManager?.update(timestepSeconds);
    // Particle manager last: controllers (via UpdateManager.tick) have
    // already pushed propulsion spawn state to the view this frame, so
    // the emitters consume the freshest position/direction.
    this._particleManager?.update(timestepSeconds);
  }

  protected override preDestroy(): void {
    this._timelineManager?.cancelAll();
    this._particleManager?.destroyAll();
    this._cameraController = null;
    this._gameAreaView?.destroy();
    this._gameAreaView = null;
  }
}
