import {
  GamelabsApp,
  LogTypes,
  UIEvents,
  UpdateManager,
  HudLayer,
  AssetRequest,
  AssetRequestList,
  AssetTypes,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { Physics2DBinding, Physics2DManager } from "@gamebyte/gamelabsjs/physics2d";

import { GameView } from "./views/GameView.pixi";
import { GameViewController } from "./controllers/GameViewController";
import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { MergeOperations } from "./utilities/MergeOperations";
import { MergeGameConfig } from "./MergeGameConfig";
import { MergeGameUIIds } from "./MergeGameUIIds";
import { MergeGameAssetIds } from "./MergeGameAssetIds";

export class MergeGameApp extends GamelabsApp {
  private readonly _config: MergeGameConfig;
  private readonly _assetRequestList = new AssetRequestList();
  private _physicsUnsub: Unsubscribe | null = null;
  private _gameView: GameView | null = null;

  public constructor(stageEl: HTMLElement) {
    const config = new MergeGameConfig();
    const lb = config.letterbox;
    super({
      mount: stageEl,
      configOverridesUrl: "./game-config.json",
      // Letterbox the play area to an aspect BAND: within [minAspect, maxAspect]
      // the canvases fill the mount (no bars); only outside the band does the
      // framework pillarbox/letterbox to the nearest edge and paint the inert
      // bars (this color). The view then does a uniform design→canvas scale.
      viewport: {
        fit: "contain",
        minAspect: lb.minAspect,
        maxAspect: lb.maxAspect,
        background: `#${(lb.color >>> 0).toString(16).padStart(6, "0").slice(-6)}`,
      },
    });
    this._config = config;
  }

  protected override getOverridableConfig(): object {
    return this._config;
  }

  protected override loadAssets(): void {
    // Texture assets live in the project `assets/` folder (generated PNGs).
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.HudTexture, MergeGameAssetIds.Ball, new URL("../assets/ball.png", import.meta.url).href),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.HudTexture, MergeGameAssetIds.Star, new URL("../assets/star.png", import.meta.url).href),
    );
    this.assetManager.loadAll(this._assetRequestList.getRequests());
  }

  protected override registerModules(): void {
    // Game space is y-up toward the far edge; a positive gravityY pulls toward
    // the near (player) edge, i.e. negative game-space y. Default 0 = no gravity.
    this.addModule(new Physics2DBinding({ gravity: { x: 0, y: -this._config.physics.gravityY } }));
  }

  protected override configureDI(): void {
    // Config is needed by views (viewDiContainer) and controllers/operations (diContainer).
    this.diContainer.bindInstance(MergeGameConfig, this._config);
    this.viewDiContainer.bindInstance(MergeGameConfig, this._config);

    this.diContainer.bindSingleton(MergeOperations, () => new MergeOperations());
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(MergeGameUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.register(GameView, GameViewController);
  }

  protected override postInitialize(): void {
    if (!this.hud || !this.world) {
      this.logger.log("HUD or World is not initialized", LogTypes.Error);
      throw new Error("HUD or World is not initialized");
    }

    // Step physics first each frame, before gameplay controllers.
    const physics = this.diContainer.getInstance(Physics2DManager);
    this._physicsUnsub = this.diContainer.getInstance(UpdateManager).register((dt) => physics.step(dt), -1000);

    // 2D game objects live on the HUD Content layer (bottom); the UI screen sits above.
    this._gameView = this.viewFactory.createView(GameView);
    this.hud.addChild(HudLayer.Content, this._gameView);

    this.diContainer.getInstance(UIEvents).createScreen(MergeGameUIIds.GameScreen, this._config.transitions.gameScreenEnter);
  }

  protected override preDestroy(): void {
    this._physicsUnsub?.();
    this._physicsUnsub = null;
    this._gameView?.destroy();
    this._gameView = null;
  }
}
