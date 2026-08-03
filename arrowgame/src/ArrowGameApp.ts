import { GamelabsApp, LogTypes, UIEvents, AssetTypes } from "@gamebyte/gamelabsjs";

import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";

import { ArrowGameConfig } from "./ArrowGameConfig";
import { ArrowGameUIIds } from "./ArrowGameUIIds";
import { ArrowGameAssetIds } from "./ArrowGameAssetIds";

export class ArrowGameApp extends GamelabsApp {
  private readonly _config = new ArrowGameConfig();

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(ArrowGameConfig, this._config);
    // Views resolve config from viewDiContainer, so bind it there too
    // (GameScreenView.inject reads ArrowGameConfig for the 2D board).
    this.viewDiContainer.bindInstance(ArrowGameConfig, this._config);
  }

  protected override configureViews(): void {
    // Fully 2D: a single pixi screen renders both the HUD and the board.
    this.viewFactory.registerScreen(ArrowGameUIIds.GameScreen, GameScreenView, GameScreenViewController);
  }

  protected override loadAssets(): void {
    // The ONLY gameplay asset: the arrowhead (arrows are drawn, not modeled).
    // HudTexture so the 2D pixi board can use it.
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.ArrowUp, "/assets/images/arrow_up.png");

    // HUD (2D) textures.
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.Logo, "/assets/images/logo.png");
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.BtnRestart, "/assets/images/btn_restart.png");
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.BtnNext, "/assets/images/btn_next.png");

    // Audio.
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxClick, "/assets/audio/sfx_click.mp3");
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxSlide, "/assets/audio/sfx_slide.mp3");
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxBlocked, "/assets/audio/sfx_blocked.mp3");
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxWin, "/assets/audio/sfx_win.mp3");
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.BgmGameplay, "/assets/audio/bgm_gameplay.mp3");
  }

  protected override postInitialize(): void {
    if (!this.hud) {
      this.logger.log("HUD is not initialized", LogTypes.Error);
      throw new Error("HUD is not initialized");
    }

    // Fully 2D — no 3D world view/camera. The pixi screen draws the board.
    this.diContainer.getInstance(UIEvents).createScreen(
      ArrowGameUIIds.GameScreen,
      this._config.transitions.gameScreenEnter,
    );
  }
}
