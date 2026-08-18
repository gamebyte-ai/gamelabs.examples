import { AssetTypes, GamelabsApp, LogTypes, UIComponentsBinding, UIEvents, World } from "@gamebyte/gamelabsjs";
import { SortExpressConfig } from "./SortExpressConfig";
import { SortExpressUIIds } from "./SortExpressUIIds";
import { SortExpressAssetIds } from "./SortExpressAssetIds";
import { GameplayEvents } from "./events/GameplayEvents";
import { StoreService } from "./services/StoreService";
import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { HudView } from "./views/HudView.pixi";
import { HudViewController } from "./controllers/HudViewController";
import { BoardView } from "./views/BoardView.three";
import { BoardViewController } from "./controllers/BoardViewController";
import { EndView } from "./views/EndView.pixi";
import { EndViewController } from "./controllers/EndViewController";

/**
 * Sort Express — scaffold step.
 *
 * Boots the standard {@link GamelabsApp} lifecycle and shows a single HUD
 * screen ({@link GameScreenView}) with the title **Sort Express** and a
 * tap-to-start prompt. Tapping emits a gameplay `start` event (currently just
 * logged). The game flow is layered on step by step.
 *
 * Modules:
 * - {@link UIComponentsBinding} — Button / Label style entries for the HUD.
 */
export class SortExpressApp extends GamelabsApp {
  private readonly _config = new SortExpressConfig();
  private readonly _gameplayEvents = new GameplayEvents();
  private readonly _storeService = new StoreService();
  private readonly _uiComponentsBinding = new UIComponentsBinding();

  private _unsubStart: (() => void) | null = null;
  private _boardView: BoardView | null = null;

  public constructor(stageEl: HTMLElement) {
    // CANVAS viewport (contain): fills the screen within [minAspect, maxAspect];
    // beyond maxAspect (very wide) it letterboxes to BLACK bars. The background
    // is drawn full-bleed; the gameplay UI sits in a narrower fixed-ratio "safe
    // rect" (see GameScreenView + config.gameplayAspect).
    super({
      mount: stageEl,
      viewport: {
        fit: "contain",
        minAspect: 9 / 20, // tallest/narrowest portrait phones fill (no bars)
        maxAspect: 3 / 4, // wider than this → black bars
        background: "#000000",
      },
    });
  }

  protected override registerModules(): void {
    this.addModule(this._uiComponentsBinding);
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(SortExpressConfig, this._config);
    this.viewDiContainer.bindInstance(SortExpressConfig, this._config);
    this.diContainer.bindInstance(GameplayEvents, this._gameplayEvents);
    this.diContainer.bindInstance(StoreService, this._storeService);
  }

  protected override loadAssets(): void {
    // App icon / thumbnail shown on the end card (store CTA).
    this.assetManager.load(AssetTypes.HudTexture, SortExpressAssetIds.AppIcon, new URL("../assets/icon.webp", import.meta.url).href);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(SortExpressUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.registerScreen(SortExpressUIIds.Hud, HudView, HudViewController);
    this.viewFactory.register(BoardView, BoardViewController);
    this.viewFactory.register(EndView, EndViewController);
  }

  protected override postInitialize(): void {
    if (!this.world || !this.hud) {
      this.logger.log("World or HUD is not initialized", LogTypes.Error);
      throw new Error("World or HUD is not initialized");
    }

    // 3D board lives in the World view; it resolves World for the camera + scene.
    this.viewDiContainer.bindInstance(World, this.world);
    this._boardView = this.viewFactory.createView(BoardView);
    this.world.addRootView(this._boardView);

    // Gameplay HUD: the top-of-screen countdown bar. Non-interactive, so the 3D
    // board below stays draggable. Shown as the active screen (the title screen
    // isn't created in this scaffold step).
    this.diContainer.getInstance(UIEvents).createScreen(SortExpressUIIds.Hud, this._config.transitions.hudEnter);

    // Placeholder until the game flow exists — the start tap just logs.
    this._unsubStart = this._gameplayEvents.onStart(() =>
      this.logger.log("SortExpress: start tapped", LogTypes.Info),
    );
  }

  protected override preDestroy(): void {
    this._unsubStart?.();
    this._unsubStart = null;
    this._boardView?.destroy();
    this._boardView = null;
    super.preDestroy();
  }
}
