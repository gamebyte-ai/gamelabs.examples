import { GamelabsApp, LogTypes, UIEvents, UpdateManager, HudLayer, type Unsubscribe } from "@gamebyte/gamelabsjs";
import { Physics2DBinding, Physics2DManager } from "@gamebyte/gamelabsjs/physics2d";

import { GameView } from "./views/GameView.pixi";
import { GameViewController } from "./controllers/GameViewController";
import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { CastleCrushersConfig } from "./CastleCrushersConfig";
import { CastleCrushersUIIds } from "./CastleCrushersUIIds";
import { GameModel } from "./models/GameModel";
import { IGameModel } from "./models/IGameModel";
import { GameEvents } from "./events/GameEvents";
import { CastleOperations } from "./utilities/CastleOperations";

export class CastleCrushersApp extends GamelabsApp {
  private readonly _config: CastleCrushersConfig;
  private _physicsUnsub: Unsubscribe | null = null;
  private _gameView: GameView | null = null;

  public constructor(stageEl: HTMLElement) {
    const config = new CastleCrushersConfig();
    super({
      mount: stageEl,
      // Lock the play area to the 1280x720 design aspect so the game never
      // stretches: the framework pillarboxes/letterboxes both canvases and the
      // surrounding bars (this color) are inert dead-zones. The view then only
      // does a uniform design→canvas scale — no bars/clip of its own.
      viewport: {
        fit: "contain",
        aspectRatio: config.design.width / config.design.height,
        background: "#05080c",
      },
    });
    this._config = config;
  }

  protected override registerModules(): void {
    this.addModule(new Physics2DBinding({ gravity: { x: 0, y: 1 } }));
  }

  protected override configureDI(): void {
    // Config is needed by views (viewDiContainer) and by controllers/operations (diContainer).
    this.diContainer.bindInstance(CastleCrushersConfig, this._config);
    this.viewDiContainer.bindInstance(CastleCrushersConfig, this._config);

    this.diContainer.bindInstance(GameModel, new GameModel(), [IGameModel]);
    this.diContainer.bindInstance(GameEvents, new GameEvents());
    this.diContainer.bindSingleton(CastleOperations, () => new CastleOperations());
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(CastleCrushersUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.register(GameView, GameViewController);
  }

  protected override postInitialize(): void {
    if (!this.world || !this.hud) {
      this.logger.log("World or HUD is not initialized", LogTypes.Error);
      throw new Error("World or HUD is not initialized");
    }

    // Step physics first each frame, before gameplay controllers.
    const physics = this.diContainer.getInstance(Physics2DManager);
    this._physicsUnsub = this.diContainer.getInstance(UpdateManager).register((dt) => physics.step(dt), -1000);

    // 2D game objects live on the HUD Content layer (bottom); the UI screen sits above.
    this._gameView = this.viewFactory.createView(GameView);
    this.hud.addChild(HudLayer.Content, this._gameView);

    this.diContainer.getInstance(UIEvents).createScreen(CastleCrushersUIIds.GameScreen, this._config.transitions.gameScreenEnter);
  }

  protected override preDestroy(): void {
    this._physicsUnsub?.();
    this._physicsUnsub = null;
    this._gameView?.destroy();
    this._gameView = null;
  }
}
