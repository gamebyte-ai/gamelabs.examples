import { GamelabsApp, MainScreenAssetIds, UIComponentsBinding, UnsubscribeBag, UIEvents, UIUtils } from "@gamebyte/gamelabsjs";

import { MainScreenBinding, MainScreenEvents, MainScreenUIIds } from "@gamebyte/gamelabsjs";
import { LevelProgressScreenBinding, LevelProgressScreenEvents, LevelProgressScreenUIIds } from "@gamebyte/gamelabsjs";
import { LevelProgressModel } from "./modules/levelprogressscreen/models/LevelProgressModel";
import { ScreensConfig } from "./ScreensConfig";

export class ScreensApp extends GamelabsApp {
  // UIComponentsBinding ships the framework default styles + skin asset
  // requests for `Button`, `Background`, `Image`, etc. — `MainScreenView`
  // resolves those via `styleManager.resolve(UIComponentsStyleIds.*)`,
  // so the binding has to be registered before the screen mounts.
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  private readonly _mainScreenBinding = new MainScreenBinding();
  private readonly _levelProgressScreenBinding = new LevelProgressScreenBinding(new LevelProgressModel());
  private readonly _config = new ScreensConfig();
  private readonly _subs = new UnsubscribeBag();

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this._mainScreenBinding.assetRequestList.overrideRequest(MainScreenAssetIds.Logo, new URL("../assets/example_logo.png", import.meta.url).href);

    const playPresetReq = this._mainScreenBinding.assetRequestList.getRequest(MainScreenAssetIds.PlayButtonPreset);
    if (playPresetReq) {
      const base = playPresetReq.content as string;
      const parsed = JSON.parse(base);
      const updated = UIUtils.updateFields(base, JSON.stringify({ width: parsed.width + 50 }));
      this._mainScreenBinding.assetRequestList.overrideRequest(MainScreenAssetIds.PlayButtonPreset, "", updated);
    }

    this.addModule(this._uiComponentsBinding);
    this.addModule(this._mainScreenBinding);
    this.addModule(this._levelProgressScreenBinding);
  }

  protected override postInitialize(): void {
    const mainEvents = this.diContainer.getInstance(MainScreenEvents);
    this._subs.add(mainEvents.onPlayClick(() => this._showLevelProgressScreen()));

    const levelProgressEvents = this.diContainer.getInstance(LevelProgressScreenEvents);
    this._subs.add(levelProgressEvents.onBackClick(() => this._showMainScreen()));

    this.diContainer.getInstance(UIEvents).createScreen(MainScreenUIIds.MainScreen, this._config.transitions.mainScreenIntro);
  }

  protected override preDestroy(): void {
    this._subs.flush();
  }

  private _showLevelProgressScreen(): void {
    this.diContainer.getInstance(UIEvents).createScreen(LevelProgressScreenUIIds.LevelProgressScreen, this._config.transitions.levelProgressScreenEnter);
  }

  private _showMainScreen(): void {
    this.diContainer.getInstance(UIEvents).createScreen(MainScreenUIIds.MainScreen, this._config.transitions.mainScreenEnter);
  }
}
