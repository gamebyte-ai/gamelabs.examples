import { AssetTypes, GamelabsApp, LogTypes, UIEvents, World } from "@gamebyte/gamelabsjs";

import { BrickBreakerConfig } from "./BrickBreakerConfig";
import { BrickBreakerUIIds } from "./BrickBreakerUIIds";
import { BrickBreakerAssetIds } from "./BrickBreakerAssetIds";
import { GameEvents } from "./events/GameEvents";
import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { HudView } from "./views/HudView.pixi";
import { HudViewController } from "./controllers/HudViewController";
import { GridView } from "./views/GridView.three";
import { GridViewController } from "./controllers/GridViewController";

/**
 * Brick Breaker — scaffold step.
 *
 * Boots the standard {@link GamelabsApp} lifecycle and shows a single HUD screen
 * ({@link GameScreenView}) with the title + a tap-to-start prompt. Gameplay
 * (paddle / ball / bricks) is layered on step by step.
 */
export class BrickBreakerApp extends GamelabsApp {
  private readonly _config: BrickBreakerConfig;
  private readonly _gameEvents = new GameEvents();
  private _gridView: GridView | null = null;

  public constructor(stageEl: HTMLElement) {
    // Letterbox comes from config (same as Triple Match 3D). Build the config
    // before super() so its viewport can be passed in.
    const config = new BrickBreakerConfig();
    super({ mount: stageEl, viewport: config.viewport });
    this._config = config;
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(BrickBreakerConfig, this._config);
    this.viewDiContainer.bindInstance(BrickBreakerConfig, this._config);
    // Shared gameplay events — reachable from both controllers (diContainer) and
    // views (viewDiContainer).
    this.diContainer.bindInstance(GameEvents, this._gameEvents);
    this.viewDiContainer.bindInstance(GameEvents, this._gameEvents);
  }

  protected override loadAssets(): void {
    // Static string literals so Vite can bundle + hash the assets (a templated
    // `new URL(...)` can't be statically analysed and won't resolve in a build).
    this.assetManager.load(
      AssetTypes.HudTexture,
      BrickBreakerAssetIds.HudPill,
      new URL("../assets/SP_UI_BG_01.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      BrickBreakerAssetIds.HudTimeLabel,
      new URL("../assets/SP_Time_01.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      BrickBreakerAssetIds.HudScoreLabel,
      new URL("../assets/SP_Score_01.png", import.meta.url).href,
    );
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(BrickBreakerUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.registerScreen(BrickBreakerUIIds.Hud, HudView, HudViewController);
    this.viewFactory.register(GridView, GridViewController);
  }

  protected override postInitialize(): void {
    if (!this.world || !this.hud) {
      this.logger.log("World or HUD is not initialized", LogTypes.Error);
      throw new Error("World or HUD is not initialized");
    }

    // 3D brick grid lives in the World view (resolves World for the camera).
    this.viewDiContainer.bindInstance(World, this.world);
    this._gridView = this.viewFactory.createView(GridView);
    this.world.addRootView(this._gridView);

    // Top HUD (Time + Score). Non-interactive, so the grid/shooter below stays
    // tappable/draggable. Shown as the active screen (the title screen isn't used
    // in this scaffold step).
    this.diContainer.getInstance(UIEvents).createScreen(BrickBreakerUIIds.Hud, this._config.transitions.gameScreenEnter);
  }

  protected override preDestroy(): void {
    this._gridView?.destroy();
    this._gridView = null;
    super.preDestroy();
  }
}
