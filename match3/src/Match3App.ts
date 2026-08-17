import * as THREE from "three";
import gsap from "gsap";
import { vector } from "@js-basics/vector";
import { AssetTypes, GamelabsApp, GameCameraBinding, GameCameraManager, GridsModel, LogTypes, ParticleManager, ParticlesBinding, TimelineBinding, TimelineManager, Topdown2dCameraController, UIComponentsBinding, UIEvents, SettingsBinding, SettingsBooleanField, SettingsNumberField, SettingsManager } from "@gamebyte/gamelabsjs";
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
  private readonly _config: Match3Config;
  private readonly _gameGridBinding = new Match3GameGridBinding();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _settingsBinding = new SettingsBinding();
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  private readonly _gameEvents = new GameEvents();
  private _cameraController: Topdown2dCameraController | null = null;
  private _cameraManager: GameCameraManager | null = null;
  private _boardView: GameBoardsView | null = null;
  private _particles: ParticleManager | null = null;
  private _timeline: TimelineManager | null = null;

  public constructor(stageEl: HTMLElement) {
    // Built before super() so the viewport can read the aspect from the config:
    // instance fields are only initialized after super() returns, so the usual
    // `_config = new Match3Config()` initializer would be too late here.
    const config = new Match3Config();
    // The viewport letterboxes the render surface — both canvases (Three world +
    // Pixi HUD) are held inside the aspect band and centered in the mount, with
    // the bars painted on the mount (see Match3Config.viewport).
    super({ mount: stageEl, configOverridesUrl: "./game-config.json", viewport: config.viewport });
    this._config = config;
  }

  protected override getOverridableConfig(): object {
    return this._config;
  }

  protected override registerModules(): void {
    // Particles: pop bursts go through the framework's pooled emitter rather than
    // ad-hoc meshes, so the board shares one budget however busy a cascade gets.
    this.addModule(new ParticlesBinding(this._config.popParticles.budget));
    // Timeline: camera shake and anything else time-boxed runs as tracks the framework
    // ticks and cancels, rather than ad-hoc timers scattered through the board code.
    this.addModule(new TimelineBinding());
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
    // One texture per COLOUR. What a gem DOES is drawn over it at runtime — the stripe's
    // bars, the booster's letter, the cookie's wedges — so there is no file per special.
    const texture = (id: Match3AssetIds, file: string): void => {
      this.assetManager.load(AssetTypes.WorldTexture, id, new URL(`../assets/${file}`, import.meta.url).href);
    };

    texture(Match3AssetIds.GemRed, "gem_red.svg");
    texture(Match3AssetIds.GemBlue, "gem_blue.svg");
    texture(Match3AssetIds.GemGreen, "gem_green.svg");
    texture(Match3AssetIds.GemYellow, "gem_yellow.svg");
    texture(Match3AssetIds.GemPurple, "gem_purple.svg");
    texture(Match3AssetIds.Light, "light2.png");

    // Audio
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxSelect, new URL("../assets/sfx_select.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxSwap, new URL("../assets/sfx_swap.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxWrong, new URL("../assets/sfx_wrong.wav", import.meta.url).href);
    this.assetManager.load(AssetTypes.Audio, Match3AssetIds.SfxPop, new URL("../assets/sfx_pop.mp3", import.meta.url).href);
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

    // Scene backdrop. Distinct from the viewport `background` above: that one
    // colors the letterbox bars (mount element), this one the play area itself.
    this.world.scene.background = new THREE.Color(this._config.backgroundColor);

    // `World` ships a default Fog(0x0b0f14, 4, 20) for 3D scenes. The top-down
    // camera sits 10 units up, which lands at a 0.375 fog factor, so every
    // material — MeshBasicMaterial included, it is fog-enabled by default — gets
    // 37% dark navy mixed in and white renders as grey. A flat 2D board has no use
    // for depth cueing, so drop it. `scene.background` is unaffected by fog either
    // way, which is why only the board looked washed out.
    this.world.scene.fog = null;

    // The reserve is masked on the GEM's own material (see `GameBoardItemObjectOptions`),
    // not here. A renderer-wide plane clips every material in the scene, and three of them
    // are deliberately outside the board: the backdrop art, the crystal frame, and the
    // stripe's shockwave, which travels `stripe.wave.overshootCells` past the edge and off
    // the screen. Clipped, the wave was sliced apart mid-flight and the art lost its top
    // half. Local clipping is what lets one material opt in on its own.
    this.world.renderer.clippingPlanes = [];
    this.world.renderer.localClippingEnabled = true;

    this.diContainer.getInstance(UIEvents).createScreen(Match3UIIds.GameScreen, this._config.transitions.gameScreenEnter);
    this._boardView = this.viewFactory.createView(GameBoardsView);
    this.world.addRootView(this._boardView);
    // The view owns the emitter; the manager lives here, so registration happens here.
    const popEmitter = this._boardView.popEmitter;
    if (popEmitter) this.diContainer.getInstance(ParticleManager).register(popEmitter);

    const grid = this.diContainer.getInstance(GridsModel).getGrid(Match3Config.GRID_ID);
    if (grid) {
      // `getCenterOffset` centres ALL rows, reserve included, which would frame the
      // middle of the stack. Shift up by half the reserve so the camera sits on the
      // playable window instead, with the reserve stacked out of frame above it.
      const offset = grid.getCenterOffset();
      const toPlayable = (this._config.reserveRows / 2) * this._config.gridRowSize;
      grid.setPosition(vector(-offset.x, -offset.y, -offset.z - toPlayable));
    }
    // Console handle, for watching the board a step at a time: `match3.slow(0.2)`,
    // `match3.pause()`, `match3.play()`. `config` is the live instance, so anything
    // else on it can be poked the same way — mind that most fields are only read once.
    (window as unknown as { match3: object }).match3 = {
      config: this._config,
      slow: (scale: number) => (this._config.timeScale = scale),
      pause: () => (this._config.timeScale = 0),
      play: () => (this._config.timeScale = 1)
    };
    // The module registers the manager; nothing ticks it for us, so the app does.
    this._particles = this.diContainer.getInstance(ParticleManager);
    this._timeline = this.diContainer.getInstance(TimelineManager);
    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Topdown2dCameraController(this._cameraManager).register();
    this._cameraController.followPosition(0, 0, 0);
    // `initialize()` calls requestResize() right after this hook, so onResize
    // sets the real framing a moment later; this is only the first-frame value.
    this._applyCameraZoom(this.width, this.height);
  }

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
    this._applyCameraZoom(width, height);
  }

  /**
   * Scale the board with the screen: the ortho frustum height lerps across the
   * `camera` aspect band and pins outside it, so a narrow screen zooms out (board
   * shrinks to stay inside the side edges) and a wider one zooms in up to
   * `maxAspect`. Width follows the true aspect, so nothing is ever stretched.
   */
  private _applyCameraZoom(width: number, height: number): void {
    if (!this._cameraManager || width <= 0 || height <= 0) return;
    const c = this._config.camera;
    const span = c.maxAspect - c.minAspect;
    const t = span > 0 ? Math.max(0, Math.min(1, (width / height - c.minAspect) / span)) : 0;
    // Scaled by this level's board size, so every level frames the same way.
    const ortho = c.orthoAtMin + (c.orthoAtMax - c.orthoAtMin) * t;
    this._cameraManager.setOrthoSize(ortho * this._config.cameraBoardScale);
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    // Anything that stalls the loop — a paused debugger, a backgrounded tab, a long
    // GC — hands the next frame one enormous step. The fall is INTEGRATED per frame,
    // so a five-second step covers five seconds of gravity at once and every gem is
    // simply already at the bottom when the frame ends. Clamping spends the stall in
    // slow motion instead: time is lost, but nothing teleports.
    const scale = Math.max(0, this._config.timeScale);
    // gsap runs on its own ticker, so slowing our step alone would leave every tween
    // (the pop, the swap, the bolts, the waves) at full speed while the board crawled.
    // Set rather than assumed each frame: the console can change it at any moment.
    if (gsap.globalTimeline.timeScale() !== scale) gsap.globalTimeline.timeScale(scale);
    const step = Math.min(timestepSeconds, this._config.maxStepSec) * scale;
    this._cameraManager?.update(step);
    this._particles?.update(step);
    this._timeline?.update(step);
    // Gem falls are integrated per frame rather than tweened, so that a gem retargeted
    // mid-fall keeps its speed instead of restarting from zero.
    this._boardView?.stepFalls(step);
  }

  protected override preDestroy(): void {
    this._boardView = null;
    this._particles = null;
    this._timeline = null;
    this._cameraController = null;
    super.preDestroy();
  }
}
