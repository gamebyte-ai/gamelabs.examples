import * as PIXI from "pixi.js";
import {
  ScreenView,
  ButtonComponent,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView.js";

export class GameScreenView extends ScreenView implements IGameScreenView {
  private _scoreText: PIXI.Text | null = null;
  private _settingsBtn: ButtonComponent | null = null;
  private readonly _settingsListeners = new Set<() => void>();
  private _screenWidth = 0;

  public override postInitialize(): void {
    super.postInitialize();

    this._scoreText = new PIXI.Text({
      text: "Score: 0",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 22, fill: 0xe2e8f0 }
    });
    this.addChild(this._scoreText);

    // Settings button (top-right gear icon)
    const settingsBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 20 },
    });
    this._settingsBtn = new ButtonComponent(this.assetLoader, settingsBtnStyle, {
      width: 36, height: 36,
      label: "\u2699",
    });
    this.addChild(this._settingsBtn);
    this._settingsBtn.onPress(() => {
      for (const cb of this._settingsListeners) cb();
    });
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._screenWidth = Math.max(1, width);
    if (this._scoreText) {
      this._scoreText.x = 16;
      this._scoreText.y = 12;
    }
    if (this._settingsBtn) {
      this._settingsBtn.position.set(this._screenWidth - 52, 12);
    }
  }

  public setScore(score: number): void {
    if (this._scoreText) this._scoreText.text = `Score: ${score}`;
  }

  public onSettingsTapped(cb: () => void): Unsubscribe {
    this._settingsListeners.add(cb);
    return () => this._settingsListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._settingsListeners.clear();
    this._scoreText = null;
    this._settingsBtn = null;
    super.preDestroy();
  }
}
