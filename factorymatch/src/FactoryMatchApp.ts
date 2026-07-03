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
  private readonly _config: FactoryMatchConfig;
  private readonly _assetRequestList = new AssetRequestList();
  private _physicsUnsub: Unsubscribe | null = null;
  private _pileView: PileView | null = null;

  /** `models` must already be loaded (see main.ts) — the PileView resolves it and
   * clones synchronously when the pile spawns. The viewport letterboxes the
   * render surface (see FactoryMatchConfig.viewport). */
  public constructor(stageEl: HTMLElement, config: FactoryMatchConfig, private readonly _models: ModelLibraryService) {
    super({ mount: stageEl, viewport: config.viewport });
    this._config = config;
  }

  protected override registerModules(): void {
    const { gravity, friction, restitution } = this._config.physics;
    this.addModule(
      new Physics3DBinding({
        gravity: { x: 0, y: gravity, z: 0 },
        defaultFriction: friction,
        defaultRestitution: restitution,
      }),
    );
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
    // Placeholder UI shapes (white SVGs, tinted in the screen view).
    add(FactoryMatchAssetIds.UiPill, "UI_Pill.svg");
    add(FactoryMatchAssetIds.UiCircle, "UI_Circle.svg");
    add(FactoryMatchAssetIds.UiPanel, "UI_Panel.svg");
    add(FactoryMatchAssetIds.ShapeCube, "Shape_Cube.svg");
    add(FactoryMatchAssetIds.ShapeSphere, "Shape_Sphere.svg");
    add(FactoryMatchAssetIds.ShapeCylinder, "Shape_Cylinder.svg");
    add(FactoryMatchAssetIds.ShapeCuboid, "Shape_Cuboid.svg");
    add(FactoryMatchAssetIds.ShapePyramid, "Shape_Pyramid.svg");
    this.assetManager.loadAll(this._assetRequestList.getRequests());
  }

  protected override postInitialize(): void {
    if (!this.world || !this.hud) {
      this.logger.log("World or HUD is not initialized", LogTypes.Error);
      throw new Error("World or HUD is not initialized");
    }

    // Step physics first each frame, before gameplay controllers — but only while
    // FactoryOperations owes simulation time, so an idle pile freezes (no jitter).
    const physics = this.diContainer.getInstance(Physics3DManager);
    const ops = this.diContainer.getInstance(FactoryOperations);
    this._physicsUnsub = this.diContainer.getInstance(UpdateManager).register((dt) => {
      if (ops.physicsActive) physics.step(dt);
    }, -1000);

    // 3D game objects live in the World view; PileView resolves World for the camera + pick ray.
    this.viewDiContainer.bindInstance(World, this.world);
    this._pileView = this.viewFactory.createView(PileView);
    this.world.addRootView(this._pileView);

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
