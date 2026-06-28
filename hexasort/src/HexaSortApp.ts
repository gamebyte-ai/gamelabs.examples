import {
  AudioService,
  GamelabsApp,
  GameCameraBinding,
  GameCameraManager,
  HexGrid,
  HexGridPreset,
  ISettingsModel,
  LogTypes,
  Orbital3dCameraController,
  SCREEN_TRANSITION_TYPES,
  SettingsBinding,
  SettingsBooleanField,
  SettingsEvents,
  SettingsManager,
  SettingsNumberField,
  UIComponentsBinding,
  UIEvents,
  UnsubscribeBag,
  World,
  type ISettingsModel as ISettingsModelType,
} from "@gamebyte/gamelabsjs";
import { HexaSortConfig } from "./HexaSortConfig.js";
import { HexaSortUIIds } from "./HexaSortUIIds.js";
import { BlockGridAllocator } from "./models/BlockGridAllocator.js";
import { IHexGrid } from "./models/IHexGrid.js";
import { StacksTray } from "./models/StacksTray.js";
import { IStacksTray } from "./models/IStacksTray.js";
import { GameEvents } from "./events/GameEvents.js";
import { BlockStackOperations } from "./utilities/BlockStackOperations.js";
import { GameOperations } from "./utilities/GameOperations.js";
import { SortingManager } from "./utilities/SortingManager.js";
import { SfxService } from "./services/SfxService.js";
import { HexGridViewController } from "./controllers/HexGridViewController.js";
import { HexGridView } from "./views/HexGridView.three.js";
import { GameScreenView } from "./views/GameScreenView.pixi.js";
import { GameScreenViewController } from "./controllers/GameScreenViewController.js";
import { StacksTrayViewController } from "./controllers/StacksTrayViewController.js";
import { StacksTrayView } from "./views/StacksTrayView.three.js";

/**
 * Hexa Sort application.
 *
 * Scene:
 * - a scalable 3D hex grid centered at the world origin,
 * - a tray of three selectable block stacks in front of the grid,
 * - an orbital 3D camera locked at a tilted azimuth.
 *
 * HUD:
 * - a transparent {@link GameScreenView} hosting a settings-gear button.
 *
 * Modules:
 * - {@link GameCameraBinding} — orbital camera management.
 * - {@link SettingsBinding} — persisted settings popup (SFX toggle +
 *   volume slider). Changes apply immediately to the core
 *   {@link AudioService}.
 *
 * Model access:
 * - {@link HexGrid} and {@link StacksTray} are bound under both their
 *   concrete class tokens and the readonly {@link IHexGrid} /
 *   {@link IStacksTray} interface tokens. Controllers and views resolve
 *   the interfaces; only `GameOperations` and `SortingManager` (utilities)
 *   resolve the concrete classes and own the mutations.
 */
export class HexaSortApp extends GamelabsApp {
  private readonly _config = new HexaSortConfig();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _settingsBinding = new SettingsBinding();
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  private readonly _events = new GameEvents();
  private readonly _stackOps = new BlockStackOperations(this._config);
  private _grid: HexGrid | null = null;
  private _tray: StacksTray | null = null;
  private _gridView: HexGridView | null = null;
  private _trayView: StacksTrayView | null = null;
  private _cameraManager: GameCameraManager | null = null;
  private readonly _systemUnsubs = new UnsubscribeBag();

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._settingsBinding);
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(HexaSortConfig, this._config);
    this.viewDiContainer.bindInstance(HexaSortConfig, this._config);

    if (!this.world) {
      this.logger.log("World is not initialized", LogTypes.Error);
      throw new Error("World is not initialized");
    }
    this.viewDiContainer.bindInstance(World, this.world);

    const preset = new HexGridPreset({
      columnCount: this._config.cols,
      rowCount: this._config.rows,
      hexSize: this._config.hexSize,
    });
    const allocator = new BlockGridAllocator(this._config);
    this._grid = new HexGrid(HexaSortConfig.GRID_ID, preset, null, allocator);
    // Bind the concrete HexGrid AND the readonly IHexGrid token to the
    // same instance. Controllers/views resolve IHexGrid; only the
    // GameOperations / SortingManager utilities resolve HexGrid.
    this.diContainer.bindInstance(HexGrid, this._grid, [IHexGrid]);

    this._tray = this._createInitialTray();
    this.diContainer.bindInstance(StacksTray, this._tray, [IStacksTray]);

    this.diContainer.bindInstance(GameEvents, this._events);
    this.diContainer.bindInstance(BlockStackOperations, this._stackOps);

    const audioService = this.diContainer.getInstance(AudioService);
    this.diContainer.bindInstance(SfxService, new SfxService(audioService));

    // Singletons that own mutable state. Constructed lazily on first
    // resolve; their inject() pulls the concrete HexGrid / StacksTray.
    this.diContainer.bindSingleton(GameOperations, () => new GameOperations());
    this.diContainer.bindSingleton(SortingManager, () => new SortingManager());
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(HexaSortUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.register(HexGridView, HexGridViewController);
    this.viewFactory.register(StacksTrayView, StacksTrayViewController);
  }

  protected override postInitialize(): void {
    if (!this.world) {
      this.logger.log("World is not initialized", LogTypes.Error);
      throw new Error("World is not initialized");
    }

    // Register settings fields via SettingsManager (post-refactor the
    // binding no longer forwards addField).
    const settings = this.diContainer.getInstance(SettingsManager);
    settings.addField(new SettingsBooleanField("sfxEnabled", "Sound Effects", true));
    settings.addField(new SettingsNumberField("sfxVolume", "SFX Volume", 0.8, 0, 1, 0.1));

    // HUD screen (settings-gear button).
    this.diContainer
      .getInstance(UIEvents)
      .createScreen(HexaSortUIIds.GameScreen, { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 });

    // World views.
    this._gridView = this.viewFactory.createView(HexGridView);
    this.world.addRootView(this._gridView);
    this._trayView = this.viewFactory.createView(StacksTrayView);
    this.world.addRootView(this._trayView);

    // Camera. `register()` wires the controller into the camera manager;
    // no unregister / destroy hook exists today, so the ref is local.
    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    const camera = new Orbital3dCameraController(this._cameraManager).register();
    camera.distance = this._config.cameraDistance;
    camera.pitch = this._config.cameraPitch;
    camera.azimuth = 0;
    camera.followPosition(0, 0, 0);

    // Settings → AudioService bridge.
    this._applyInitialSettings();
    this._subscribeSettingsChanges();
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
    this._systemUnsubs.flush();
    // DI singleton: explicitly destroy so the scheduler's UpdateManager
    // subscription + in-flight phase state don't leak past app teardown.
    this.diContainer.getInstance(SortingManager).destroy();
    this._trayView?.destroy();
    this._trayView = null;
    this._gridView?.destroy();
    this._gridView = null;
    this._tray = null;
    this._grid = null;
    super.preDestroy();
  }

  private _createInitialTray(): StacksTray {
    const tray = new StacksTray(this._config.initialStacks.length);
    for (let i = 0; i < this._config.initialStacks.length; i++) {
      tray.setSlot(i, this._stackOps.createStack(this._config.initialStacks[i]!));
    }
    return tray;
  }

  /** Apply whatever the persisted settings are right now. */
  private _applyInitialSettings(): void {
    const settings = this.diContainer.getInstance(ISettingsModel);
    const audio = this.diContainer.getInstance(AudioService);
    audio.setSfxMute(!settings.getBooleanValue("sfxEnabled"));
    audio.setSfxVolume(settings.getNumberValue("sfxVolume"));
  }

  /** Keep AudioService in sync whenever the user changes a setting. */
  private _subscribeSettingsChanges(): void {
    const settings = this.diContainer.getInstance(ISettingsModel);
    const audio = this.diContainer.getInstance(AudioService);
    const events = this.diContainer.getInstance(SettingsEvents);
    this._systemUnsubs.add(
      events.onValueChanged((name) => this._onSettingValueChanged(name, settings, audio)),
    );
  }

  private _onSettingValueChanged(name: string, settings: ISettingsModelType, audio: AudioService): void {
    if (name === "sfxEnabled") {
      audio.setSfxMute(!settings.getBooleanValue("sfxEnabled"));
    } else if (name === "sfxVolume") {
      audio.setSfxVolume(settings.getNumberValue("sfxVolume"));
    }
  }
}
