import { GamelabsApp, LogTypes, UIEvents, AssetTypes } from "@gamebyte/gamelabsjs";

import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";

import { ArrowGameConfig } from "./ArrowGameConfig";
import { ArrowGameUIIds } from "./ArrowGameUIIds";
import { ArrowGameAssetIds } from "./ArrowGameAssetIds";

// Assets are IMPORTED (not fetched from /assets) so Vite bundles + inlines them
// as data: URIs — required for the single-file playable build.
import arrowUpUrl from "./assets/images/arrow_up.png";
import logoUrl from "./assets/images/logo.png";
import btnRestartUrl from "./assets/images/btn_restart.png";
import btnNextUrl from "./assets/images/btn_next.png";
import sfxClickUrl from "./assets/audio/sfx_click.mp3";
import sfxSlideUrl from "./assets/audio/sfx_slide.mp3";
import sfxBlockedUrl from "./assets/audio/sfx_blocked.mp3";
import sfxWinUrl from "./assets/audio/sfx_win.mp3";
import bgmGameplayUrl from "./assets/audio/bgm_gameplay.mp3";

export class ArrowGameApp extends GamelabsApp {
  private readonly _config = new ArrowGameConfig();

  public constructor(stageEl: HTMLElement) {
    // No configOverridesUrl: this game targets single-file playables (no server to
    // fetch game-config.json — runtime config-override is a hosted-web feature).
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
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.ArrowUp, arrowUpUrl);

    // HUD (2D) textures.
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.Logo, logoUrl);
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.BtnRestart, btnRestartUrl);
    this.assetManager.load(AssetTypes.HudTexture, ArrowGameAssetIds.BtnNext, btnNextUrl);

    // Audio.
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxClick, sfxClickUrl);
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxSlide, sfxSlideUrl);
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxBlocked, sfxBlockedUrl);
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.SfxWin, sfxWinUrl);
    this.assetManager.load(AssetTypes.Audio, ArrowGameAssetIds.BgmGameplay, bgmGameplayUrl);
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
