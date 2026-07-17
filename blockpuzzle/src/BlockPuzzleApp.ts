import {
  AssetTypes,
  GamelabsApp,
  GameCameraBinding,
  GameCameraManager,
  GridsModel,
  LogTypes,
  ParticleManager,
  ParticlesBinding,
  RectGrid,
  Topdown2dCameraController,
  UIComponentsBinding,
  UIEvents,
  World,
  GridEvents,
} from "@gamebyte/gamelabsjs";
import { BlockPuzzleAssetIds } from "./BlockPuzzleAssetIds";
import { BlockPuzzleConfig } from "./BlockPuzzleConfig";
import { BlockPuzzleUIIds } from "./BlockPuzzleUIIds";
import { BlockPuzzleGameGridBinding } from "./modules/gamegrid/BlockPuzzleGameGridBinding";
import { GameBoardsView } from "./modules/gamegrid/views/GameBoardsView.three";
import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { BoardLayoutCalculator } from "./utilities/BoardLayoutCalculator";
import { BoosterPanelModel } from "./models/BoosterPanelModel";
import { ComboModel } from "./models/ComboModel";
import { GameStateModel } from "./models/GameStateModel";
import { ScoreModel } from "./models/ScoreModel";
import { TimerModel } from "./models/TimerModel";
import { TrayPlaceabilityModel } from "./models/TrayPlaceabilityModel";
import { TrayEvents } from "./events/TrayEvents";
import { GameState } from "./constants/GameState";
import { ItemIdGenerator } from "./utilities/ItemIdGenerator";
import { LineClearRule } from "./utilities/LineClearRule";
import { PieceSpawnOperations } from "./utilities/PieceSpawnOperations";

/**
 * Block Puzzle app — static layout (step 1), initial 3-piece hand
 * spawn (step 2), and drag-drop placement (step 3).
 *
 * Modules:
 * - {@link GameCameraBinding} — top-down 2D camera; ortho size fits
 *   the combined grid + tray content with `boardMargin` headroom.
 * - {@link BlockPuzzleGameGridBinding} — extends `GameGridBinding`
 *   with per-surface cell palettes, shape-driven piece visuals, the
 *   custom `GameBoardsView` that owns the drag pipeline, and the
 *   `GameBoardsViewController` that wires placement to the rules.
 * - {@link UIComponentsBinding} — provides the Label / Button style
 *   entries the HUD reads.
 *
 * Scene:
 * - One `RectGrid` registered as `boardIds.grid` (the playing grid,
 *   8×8 by default) and one registered as `boardIds.tray` (a 1×K row
 *   of slots, K=3 by default). Both flow through `GridsModel` →
 *   `GameBoardsViewController` → `GameBoardsView`.
 * - On game start, {@link PieceSpawnOperations.dealInitialHand}
 *   seeds the tray with K distinct-coloured pieces.
 * - Pointer-down on a tray piece starts a drag; the view ghosts the
 *   candidate footprint on the playing grid and validates via the
 *   predicate the controller installs. On valid drop the controller
 *   places the piece (N grid items) and empties the tray slot.
 *
 * Seams left unwired in this step:
 * - {@link ISpawnSource} (refill source: tray today, falling-piece
 *   later) lives in `utilities/`.
 * - {@link IClearRule} (which cells clear after a placement: full
 *   row/column today, region/colour-match later) lives in
 *   `utilities/`.
 */
export class BlockPuzzleApp extends GamelabsApp {
  private readonly _config = new BlockPuzzleConfig();
  private readonly _itemIds = new ItemIdGenerator();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _gameGridBinding = new BlockPuzzleGameGridBinding(this._config);
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  private readonly _particlesBinding = new ParticlesBinding();
  private readonly _gameState = new GameStateModel();
  private readonly _scoreModel = new ScoreModel();
  private readonly _timerModel = new TimerModel();
  private readonly _comboModel = new ComboModel(this._config.combo.maxMoves);
  private readonly _boosterModel = new BoosterPanelModel(this._config.booster.stagesPerCharge);
  private readonly _placeabilityModel = new TrayPlaceabilityModel();
  private _cameraController: Topdown2dCameraController | null = null;
  private _cameraManager: GameCameraManager | null = null;
  private _gridsModel: GridsModel | null = null;
  private _particleManager: ParticleManager | null = null;

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl, configOverridesUrl: "./game-config.json" });
  }

  protected override getOverridableConfig(): object {
    return this._config;
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._gameGridBinding);
    this.addModule(this._uiComponentsBinding);
    this.addModule(this._particlesBinding);
  }

  protected override loadAssets(): void {
    // Booster button icons — single-colour SVGs the HUD view paints
    // into Sprites and tints to `booster.buttonLabelColor`. Loaded
    // as HUD textures (Pixi `Assets.load`) because they only render
    // in the booster panel inside the screen-view layer.
    this.assetManager.load(
      AssetTypes.HudTexture,
      BlockPuzzleAssetIds.HammerIcon,
      new URL("../assets/hammer.svg", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      BlockPuzzleAssetIds.UnitBlockIcon,
      new URL("../assets/unit-block.svg", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      BlockPuzzleAssetIds.TrayRefreshIcon,
      new URL("../assets/recycle.svg", import.meta.url).href,
    );
  }

  protected override configureDI(): void {
    if (!this.world) {
      this.logger.log("World is not initialized", LogTypes.Error);
      throw new Error("World is not initialized");
    }
    this.diContainer.bindInstance(BlockPuzzleConfig, this._config);
    this.viewDiContainer.bindInstance(BlockPuzzleConfig, this._config);
    this.diContainer.bindInstance(ItemIdGenerator, this._itemIds);
    // `LineClearRule` implements the {@link IClearRule} seam — the
    // controller runs it after every placement (to clear full lines)
    // and exposes a predictive call so the view can paint the
    // would-clear rows/columns in the ghost preview.
    this.diContainer.bindInstance(LineClearRule, new LineClearRule());
    // Top-level game state (Playing / GameOver / TimeUp). Boards
    // controller writes GameOver when every tray piece is
    // unplaceable; HUD controller writes TimeUp when the countdown
    // hits zero. Both writers guard on `state === Playing`.
    this.diContainer.bindInstance(GameStateModel, this._gameState);
    // Score + timer. ScoreModel is the controller's write target on
    // placement / clear; TimerModel accumulates elapsed time in
    // `onStep` while the game is Playing. Both reuse Solitaire's
    // model shapes; the HUD reads them via `onChange` subscriptions.
    this.diContainer.bindInstance(ScoreModel, this._scoreModel);
    this.diContainer.bindInstance(TimerModel, this._timerModel);
    // Combo streak — written by the boards controller per
    // placement, read by the HUD controller via `onChange`.
    this.diContainer.bindInstance(ComboModel, this._comboModel);
    // Booster panel lifecycle — boards controller calls
    // registerClear per placement; HUD controller subscribes for
    // the visual state and routes button taps to consume().
    this.diContainer.bindInstance(BoosterPanelModel, this._boosterModel);
    // "Any tray piece placeable?" — boards controller writes per
    // recompute, HUD controller reads to choose the ready-state
    // booster label.
    this.diContainer.bindInstance(TrayPlaceabilityModel, this._placeabilityModel);
    // Tray-lifecycle event channel — HUD controller fires
    // `requestRefresh` after a Tray Refresh consume; boards
    // controller orchestrates the exit-clear-deal sequence.
    this.diContainer.bindInstance(TrayEvents, new TrayEvents());
    // `GameBoardsView` raycasts piece meshes against the active
    // camera — it needs the World instance for the renderer canvas
    // and scene access.
    this.viewDiContainer.bindInstance(World, this.world);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(BlockPuzzleUIIds.GameScreen, GameScreenView, GameScreenViewController);
  }

  protected override postInitialize(): void {
    if (!this.hud || !this.world) {
      this.logger.log("HUD or world is not initialized", LogTypes.Error);
      throw new Error("HUD or world is not initialized");
    }

    this.diContainer.getInstance(UIEvents).createScreen(BlockPuzzleUIIds.GameScreen, this._config.transitions.gameScreenEnter);

    // Instantiate the boards world view first. Its
    // `GameBoardsViewController` (registered by
    // `BlockPuzzleGameGridBinding`) subscribes to `GridEvents` during
    // its `initialize` so subsequent `addGrid` calls auto-sync into
    // the scene. Module registration alone only registers the pair
    // with the view factory — nothing renders until the app
    // constructs the view here.
    this.world.addRootView(this.viewFactory.createView(GameBoardsView));

    // Build + register both grids. They share `GridEvents` /
    // `GridsModel`; the controller's `onGridAdded` handler creates
    // the corresponding `GridObject` (and its cell visuals) in the
    // world view above. Positions get set just after — `_applyLayout`
    // is the single owner of grid Z positions (recomputed on every
    // resize since the grid is top-anchored to the camera viewport).
    const gridEvents = this.diContainer.getInstance(GridEvents);
    this._gridsModel = this.diContainer.getInstance(GridsModel);

    const playingGrid = new RectGrid(this._config.boardIds.grid, BoardLayoutCalculator.makeGridPreset(this._config), gridEvents);
    this._gridsModel.addGrid(playingGrid);

    const tray = new RectGrid(this._config.boardIds.tray, BoardLayoutCalculator.makeTrayPreset(this._config), gridEvents);
    this._gridsModel.addGrid(tray);

    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Topdown2dCameraController(this._cameraManager).register();
    this._cameraController.followPosition(0, 0, 0);
    this._applyLayout(this.width, this.height);

    PieceSpawnOperations.dealHand(tray, this._config.pieceTypes, this._config.rotatedShapes, this._config.blockColors, this._itemIds);

    // Particle pipeline — `ParticlesBinding` bound `ParticleManager`
    // and `ParticleBudget`; the boards view constructs the
    // {@link HammerParticleEmitter} and the boards controller
    // registers it with the manager. `onStep` ticks the manager.
    this._particleManager = this.diContainer.getInstance(ParticleManager);
  }

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
    this._applyLayout(width, height);
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    this._cameraManager?.update(timestepSeconds);
    this._particleManager?.update(timestepSeconds);
    // Tick the timer only while in the Playing state — game-over
    // freezes the clock so the displayed time matches the moment
    // the player lost.
    if (this._gameState.state === GameState.Playing) {
      this._timerModel.tick(timestepSeconds);
    }
  }

  protected override preDestroy(): void {
    this._particleManager?.destroyAll();
    this._particleManager = null;
    this._cameraController = null;
    this._cameraManager = null;
    super.preDestroy();
  }

  /**
   * Single owner of the camera ortho size + the grid / tray Z
   * positions. Recomputes both for the current viewport and pushes
   * the new grid positions through `setPosition` (the framework
   * relays via `onPositionChanged` → `updateGridPosition`, so the
   * playing grid's children — cell visuals, panel, separator, item
   * objects — all move along).
   *
   * Re-runs on every resize because the grid is *top-anchored*: its
   * Z position depends on `orthoSize`, which depends on aspect.
   */
  private _applyLayout(viewportWidth: number, viewportHeight: number): void {
    if (!this._cameraManager || !this._gridsModel) return;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    const layout = BoardLayoutCalculator.compute(this._config, viewportWidth, viewportHeight);
    this._cameraManager.setOrthoSize(layout.orthoSize);
    this._gridsModel.getGrid(this._config.boardIds.grid)?.setPosition(layout.gridPosition);
    this._gridsModel.getGrid(this._config.boardIds.tray)?.setPosition(layout.trayPosition);
  }
}
