import {
  AssetRequest,
  AssetRequestList,
  AssetTypes,
  GamelabsApp,
  LogTypes,
  UIEvents,
  UpdateManager,
  World,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { Physics3DBinding, Physics3DManager } from "@gamebyte/gamelabsjs/physics3d";

import { PileView } from "./views/PileView.three";
import { PileViewController } from "./controllers/PileViewController";
import { FactoryScreenView } from "./views/FactoryScreenView.pixi";
import { FactoryScreenViewController } from "./controllers/FactoryScreenViewController";
import { FactoryMatchConfig } from "./FactoryMatchConfig";
import { FactoryMatchUIIds } from "./FactoryMatchUIIds";
import { FactoryMatchAssetIds } from "./FactoryMatchAssetIds";
import { GameModel } from "./models/GameModel";
import { IGameModel } from "./models/IGameModel";
import { TimerModel } from "./models/TimerModel";
import { GameEvents } from "./events/GameEvents";
import { FactoryOperations } from "./utilities/FactoryOperations";
import { ModelLibraryService } from "./services/ModelLibraryService";

export class FactoryMatchApp extends GamelabsApp {
  private readonly _config = new FactoryMatchConfig();
  private readonly _assetRequestList = new AssetRequestList();
  private _physicsUnsub: Unsubscribe | null = null;
  private _pileView: PileView | null = null;

  /** `models` must already be loaded (see main.ts) — the PileView resolves it and
   * clones synchronously when the pile spawns. */
  public constructor(stageEl: HTMLElement, private readonly _models: ModelLibraryService) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(new Physics3DBinding({ gravity: { x: 0, y: -9.82, z: 0 } }));
  }

  protected override configureDI(): void {
    // Config is needed by views (viewDiContainer) and by controllers/operations (diContainer).
    this.diContainer.bindInstance(FactoryMatchConfig, this._config);
    this.viewDiContainer.bindInstance(FactoryMatchConfig, this._config);

    // Loaded model prototypes — resolved by PileView to clone pile/tray shapes.
    this.viewDiContainer.bindInstance(ModelLibraryService, this._models);

    this.diContainer.bindInstance(GameModel, new GameModel(), [IGameModel]);
    this.diContainer.bindInstance(TimerModel, new TimerModel());
    this.diContainer.bindInstance(GameEvents, new GameEvents());
    this.diContainer.bindSingleton(FactoryOperations, () => new FactoryOperations());
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(FactoryMatchUIIds.GameScreen, FactoryScreenView, FactoryScreenViewController);
    this.viewFactory.register(PileView, PileViewController);
  }

  protected override loadAssets(): void {
    // HUD textures load through the AssetManager pipeline; the screen view
    // resolves them by id with `assetLoader.getAsset` once they're ready.
    const add = (id: FactoryMatchAssetIds, fileName: string): void => {
      const url = new URL(`../assets/ui/${fileName}`, import.meta.url).href;
      this._assetRequestList.addRequest(new AssetRequest(AssetTypes.HudTexture, id, url));
    };
    add(FactoryMatchAssetIds.TimerBg, "UI_Timer_BG_01.png");
    add(FactoryMatchAssetIds.GoalBg, "UI_Goal_BG_01.png");
    add(FactoryMatchAssetIds.MultiplierBg, "UI_Multiplier_BG_Circle_01.png");
    add(FactoryMatchAssetIds.ResultAllClear, "FBT_TM3D_AllClear.png");
    add(FactoryMatchAssetIds.ResultTimeIsUp, "FBT_TM3D_TimeIsUp.png");
    add(FactoryMatchAssetIds.ResultGameOver, "FBT_TM3D_GameOver.png");
    add(FactoryMatchAssetIds.GoalIconDice, "Toy_Dice_Purple.png");
    add(FactoryMatchAssetIds.GoalIconRadio, "Radio_Turqoise.png");
    add(FactoryMatchAssetIds.GoalIconBillard, "BillardBall_8.png");
    add(FactoryMatchAssetIds.BoosterFan, "UI_Booster_Fan_Passive_01.png");
    add(FactoryMatchAssetIds.BoosterSpring, "UI_Booster_Spring_Passive_01.png");
    this.assetManager.loadAll(this._assetRequestList.getRequests());
  }

  protected override postInitialize(): void {
    if (!this.world || !this.hud) {
      this.logger.log("World or HUD is not initialized", LogTypes.Error);
      throw new Error("World or HUD is not initialized");
    }

    // Step physics first each frame, before gameplay controllers.
    const physics = this.diContainer.getInstance(Physics3DManager);
    this._physicsUnsub = this.diContainer.getInstance(UpdateManager).register((dt) => physics.step(dt), -1000);

    // 3D game objects live in the World view; PileView resolves World for the camera + pick ray.
    this.viewDiContainer.bindInstance(World, this.world);
    this._pileView = this.viewFactory.createView(PileView);
    this.world.addView(this._pileView);

    this.diContainer.getInstance(UIEvents).createScreen(FactoryMatchUIIds.GameScreen, this._config.transitions.gameScreenEnter);
  }

  protected override preDestroy(): void {
    this._physicsUnsub?.();
    this._physicsUnsub = null;
    this._pileView?.destroy();
    this._pileView = null;
    // Free the shared model GPU resources after the view (and its clones) are gone.
    this._models.dispose();
  }
}
