import * as PIXI from "pixi.js";
import {
  ButtonComponent,
  HudViewBase,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { ISettingsModuleDemoView } from "./ISettingsModuleDemoView.js";

const HINT_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 13,
  fontWeight: "500",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  wordWrap: true,
  wordWrapWidth: 360,
};

/**
 * Stage view for the Settings module demo. Renders a single gear
 * button (44×44, "⚙" glyph) in the same style as the game examples'
 * in-HUD settings buttons, with a one-line hint above it explaining
 * the demo's purpose. Pressing the button fires `onSettingsTapped`;
 * the controller forwards the press to
 * `UIEvents.createPopup(SettingsUIIds.SettingsPopup)`. The popup
 * itself is the framework default — the playground does NOT register
 * any fields on top of it, so the popup renders exactly as the
 * `SettingsBinding` provides it (with `audioFields: true`, that's
 * `sfx` / `music` / `sfxVolume` / `musicVolume`).
 */
export class SettingsModuleDemoView extends HudViewBase implements ISettingsModuleDemoView {
  private _column: VerticalLayoutComponent | null = null;
  private _settingsBtn: ButtonComponent | null = null;
  private readonly _settingsListeners = new Set<() => void>();

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};

    const column = new VerticalLayoutComponent({
      gap: 10,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    this._column = column;
    this.addChild(column);

    const hint = new PIXI.Text({
      text: "Tap the gear button to open the settings popup — used for testing the settings UI.",
      style: HINT_STYLE,
    });
    hint.layout = {};
    column.addChild(hint);

    const settingsBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 22, color: 0xcbd5e0 },
    });
    this._settingsBtn = new ButtonComponent(this.assetLoader, settingsBtnStyle, {
      width: 44,
      height: 44,
      label: "⚙",
    });
    column.addChild(this._settingsBtn);
    this._settingsBtn.onPress(() => this._fireSettingsTapped());
  }

  private _fireSettingsTapped(): void {
    for (const cb of this._settingsListeners) cb();
  }

  public onSettingsTapped(cb: () => void): Unsubscribe {
    this._settingsListeners.add(cb);
    return () => this._settingsListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._settingsListeners.clear();
    this._settingsBtn = null;
    this._column?.removeFromParent();
    this._column?.destroy({ children: true });
    this._column = null;
    super.preDestroy();
  }
}
