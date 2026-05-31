import * as PIXI from "pixi.js";
import {
  ButtonComponent,
  ScreenView,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView.js";

/**
 * PIXI overlay: top-left title/subtitle and a top-right settings gear
 * button. The button is the only interactive element — gameplay input
 * is handled by the world view.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private _titleText: PIXI.Text | null = null;
  private _subtitleText: PIXI.Text | null = null;
  private _settingsBtn: ButtonComponent | null = null;
  private readonly _settingsListeners = new Set<() => void>();

  public override postInitialize(): void {
    super.postInitialize();

    this._titleText = new PIXI.Text({
      text: "Color Block Jam",
      style: {
        fill: 0xe8eef6,
        fontSize: 22,
        fontWeight: "800",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      },
    });
    this._titleText.position.set(20, 18);
    this.addChild(this._titleText);

    this._subtitleText = new PIXI.Text({
      text: "",
      style: {
        fill: 0x94a3b8,
        fontSize: 14,
        fontWeight: "600",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      },
    });
    this._subtitleText.position.set(20, 48);
    this.addChild(this._subtitleText);

    const settingsBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 22, color: 0xe8eef6 },
    });
    this._settingsBtn = new ButtonComponent(this.assetLoader, settingsBtnStyle, {
      width: 44,
      height: 44,
      label: "⚙", // ⚙ — cog glyph
    });
    this.addChild(this._settingsBtn);
    this._settingsBtn.onPress(() => {
      for (const cb of this._settingsListeners) cb();
    });
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    if (this._settingsBtn) this._settingsBtn.position.set(width - 60, 16);
  }

  public setTitle(title: string): void {
    if (this._titleText) this._titleText.text = title;
  }

  public setSubtitle(subtitle: string): void {
    if (this._subtitleText) this._subtitleText.text = subtitle;
  }

  public onSettingsTapped(cb: () => void): Unsubscribe {
    this._settingsListeners.add(cb);
    return () => this._settingsListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._settingsListeners.clear();
    this._titleText = null;
    this._subtitleText = null;
    this._settingsBtn = null;
    super.preDestroy();
  }
}
