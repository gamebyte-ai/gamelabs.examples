import { GamelabsApp, LogTypes, UIEvents } from "@gamebyte/gamelabsjs";

import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";

import { TemplateConfig } from "./TemplateConfig";
import { TemplateUIIds } from "./TemplateUIIds";

export class TemplateApp extends GamelabsApp {
  private readonly _config = new TemplateConfig();

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(TemplateConfig, this._config);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(TemplateUIIds.GameScreen, GameScreenView, GameScreenViewController);
  }

  protected override postInitialize(): void {
    if (!this.hud || !this.world) {
      this.logger.log("HUD or World is not initialized", LogTypes.Error);
      throw new Error("HUD or World is not initialized");
    }

    this.diContainer.getInstance(UIEvents).createScreen(TemplateUIIds.GameScreen, this._config.transitions.gameScreenEnter);
  }
}
