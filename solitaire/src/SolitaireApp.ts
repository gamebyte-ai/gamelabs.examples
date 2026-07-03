import {
  AssetTypes,
  GamelabsApp,
  GameCameraBinding,
  GameCameraManager,
  LogTypes,
  Topdown2dCameraController,
  UIComponentsBinding,
  UIEvents,
  World,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";

import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { BoardView } from "./views/BoardView.three";
import { BoardViewController } from "./controllers/BoardViewController";

import { BoardModel } from "./models/BoardModel";
import { IBoardModel } from "./models/IBoardModel";
import { UndoHistory } from "./models/UndoHistory";
import { UndoEvents } from "./events/UndoEvents";
import { ScoreModel } from "./models/ScoreModel";
import { TimerModel } from "./models/TimerModel";
import { GameStateModel } from "./models/GameStateModel";
import { GameState } from "./constants/GameState";
import { GameSettingsEvents } from "./events/GameSettingsEvents";
import { DealOperations } from "./utilities/DealOperations";
import { BoardBoundsCalculator } from "./utilities/BoardBoundsCalculator";
import type { IRng } from "./utilities/IRng";
import { SeededRng } from "./utilities/SeededRng";
import { MathRandomRng } from "./utilities/MathRandomRng";
import { SolitaireConfig } from "./SolitaireConfig";
import { SolitaireUIIds } from "./SolitaireUIIds";
import { SolitaireAssetIds } from "./SolitaireAssetIds";

const BOARD_PADDING = 0.6;

export class SolitaireApp extends GamelabsApp {
  private readonly _config = new SolitaireConfig();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  private readonly _boardModel = new BoardModel({
    drawCount: this._config.drawCount,
    wasteFanX: this._config.wasteFanX,
  });
  private readonly _undoHistory = new UndoHistory();
  private readonly _undoEvents = new UndoEvents();
  private readonly _scoreModel = new ScoreModel();
  private readonly _timerModel = new TimerModel();
  private readonly _gameStateModel = new GameStateModel();
  private readonly _gameSettingsEvents = new GameSettingsEvents();
  private _boardView: BoardView | null = null;
  private _cameraManager: GameCameraManager | null = null;
  private _cameraController: Topdown2dCameraController | null = null;
  private _modeChangeUnsub: Unsubscribe | null = null;

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    if (!this.world) {
      this.logger.log("World is not initialized", LogTypes.Error);
      throw new Error("World is not initialized");
    }
    this.viewDiContainer.bindInstance(World, this.world);

    this.diContainer.bindInstance(SolitaireConfig, this._config);
    this.viewDiContainer.bindInstance(SolitaireConfig, this._config);
    this.diContainer.bindInstance(BoardModel, this._boardModel, [IBoardModel]);
    this.diContainer.bindInstance(UndoHistory, this._undoHistory);
    this.diContainer.bindInstance(UndoEvents, this._undoEvents);
    this.diContainer.bindInstance(ScoreModel, this._scoreModel);
    this.diContainer.bindInstance(TimerModel, this._timerModel);
    this.diContainer.bindInstance(GameStateModel, this._gameStateModel);
    this.diContainer.bindInstance(GameSettingsEvents, this._gameSettingsEvents);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(SolitaireUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.register<BoardView, BoardViewController>(BoardView, BoardViewController);
  }

  protected override loadAssets(): void {
    // Only the shared card body artwork is asset-loaded. The 52 unique
    // card faces are composed at runtime from these PNGs plus cached
    // rank/suit glyph canvases (see CardObject) — that keeps the asset
    // count flat at two regardless of how many cards or variants get
    // added later, while still exercising the full AssetManager
    // pipeline (AssetIds + loadAssets + assetLoader.getAsset).
    this.assetManager.load(AssetTypes.WorldTexture, SolitaireAssetIds.CardFront, new URL("../assets/card-front.png", import.meta.url).href);
    this.assetManager.load(AssetTypes.WorldTexture, SolitaireAssetIds.CardBack, new URL("../assets/card-back.png", import.meta.url).href);
  }

  protected override postInitialize(): void {
    if (!this.hud) {
      this.logger.log("HUD is not initialized", LogTypes.Error);
      throw new Error("HUD is not initialized");
    }
    if (!this.world) {
      this.logger.log("World is not initialized", LogTypes.Error);
      throw new Error("World is not initialized");
    }

    this.diContainer.getInstance(UIEvents).createScreen(SolitaireUIIds.GameScreen, this._config.transitions.gameScreenEnter);

    const dealOrder = DealOperations.deal(this._boardModel, this.createRng());

    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Topdown2dCameraController(this._cameraManager).register();

    this._boardView = this.viewFactory.createView(BoardView);
    this.world.addRootView(this._boardView);

    this.updateCameraFit(this.width, this.height);

    // Animate the opening deal. The view re-locates the 28 tableau
    // cards onto the stock pile in Phase 1 (synchronously, before the
    // first rendered frame) and tweens them out one by one. Input is
    // blocked for the duration via the view's animation gate. The
    // game state flips Dealing→Playing on completion, which is what
    // unpauses the countdown timer (see `onStep`).
    this._boardView.playDealAnimation(dealOrder, () => {
      this._gameStateModel.setState(GameState.Playing);
    });

    // HUD's Turn 1 / Turn 3 radio group routes user picks through
    // `GameSettingsEvents`; on each pick, restart the level with the
    // new draw count.
    this._modeChangeUnsub = this._gameSettingsEvents.onModeChangeRequested((drawCount) => this.restartLevel(drawCount));
  }

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
    this.updateCameraFit(width, height);
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    this._cameraManager?.update(timestepSeconds);
    // Timer only advances while the player is actively in the game.
    // During the opening deal animation, state is Dealing; once the
    // countdown reaches zero, state is TimeOver. Both gate the tick.
    if (this._gameStateModel.state === GameState.Playing) {
      this._timerModel.tick(timestepSeconds);
    }
  }

  protected override preDestroy(): void {
    this._modeChangeUnsub?.();
    this._modeChangeUnsub = null;
    this._boardView?.destroy();
    this._boardView = null;
    this._cameraController = null;
    this._cameraManager = null;
  }

  /**
   * Full level restart driven by the HUD's Turn 1 / Turn 3 radio
   * group. Clears every pile, switches the waste's `drawCount` to the
   * picked value, re-deals from a fresh non-deterministic shuffle, and
   * resets all side state (score / timer / undo history / game state)
   * so the new run starts clean. The view refreshes to the new model,
   * then runs the standard deal animation; the existing
   * Dealing → Playing transition wires the timer back up.
   */
  private restartLevel(newDrawCount: number): void {
    if (!this._boardView) return;
    for (const pile of this._boardModel.allPiles) {
      pile.clear();
    }
    this._boardModel.waste.setDrawCount(newDrawCount);
    const dealOrder = DealOperations.deal(this._boardModel, new MathRandomRng());
    this._scoreModel.reset();
    this._timerModel.reset();
    this._undoHistory.clear();
    this._gameStateModel.setState(GameState.Dealing);
    this._boardView.refresh();
    this._boardView.playDealAnimation(dealOrder, () => {
      this._gameStateModel.setState(GameState.Playing);
    });
  }

  private createRng(): IRng {
    return this._config.shuffleSeed === null ? new MathRandomRng() : new SeededRng(this._config.shuffleSeed);
  }

  private updateCameraFit(viewportWidth: number, viewportHeight: number): void {
    if (!this._cameraManager || !this._cameraController) return;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    const bounds = BoardBoundsCalculator.compute(this._boardModel.allPiles, this._config.slotWidth, this._config.slotHeight);
    if (!bounds) return;

    const contentW = bounds.maxX - bounds.minX + BOARD_PADDING * 2;
    const contentH = bounds.maxZ - bounds.minZ + BOARD_PADDING * 2;
    const aspect = viewportWidth / viewportHeight;
    this._cameraManager.setOrthoSize(Math.max(contentH, contentW / aspect));

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    this._cameraController.followPosition(centerX, 0, centerZ);
  }
}
