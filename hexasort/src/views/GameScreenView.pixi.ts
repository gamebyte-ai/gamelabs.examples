import {
  ScreenView,
  ButtonComponent,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView.js";

/**
 * Transparent HUD overlay carrying only the settings gear button in the
 * top-right corner. All gameplay visuals live in the world (Three.js); this
 * screen just provides a PixiJS touch-point for the popup system.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private _settingsBtn: ButtonComponent | null = null;
  private readonly _settingsListeners = new Set<() => void>();

  public override postInitialize(): void {
    super.postInitialize();

    const settingsBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 22, color: 0xcbd5e0 },
    });
    this._settingsBtn = new ButtonComponent(this.assetLoader, settingsBtnStyle, {
      width: 44,
      height: 44,
      label: "\u2699",
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

  public onSettingsTapped(cb: () => void): Unsubscribe {
    this._settingsListeners.add(cb);
    return () => this._settingsListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._settingsListeners.clear();
    this._settingsBtn = null;
    super.preDestroy();
  }
}
