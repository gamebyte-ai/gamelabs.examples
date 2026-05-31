import {
  SettingsUIIds,
  UIEvents,
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { ISettingsModuleDemoView } from "../views/ISettingsModuleDemoView.js";

/**
 * Controller for `SettingsModuleDemoView`. Forwards the gear-button
 * press to `UIEvents.createPopup(SettingsUIIds.SettingsPopup)`. The
 * popup is the framework default — no playground chrome is layered
 * on top, and the playground app does NOT register any settings
 * fields on the `SettingsManager`, so the popup renders exactly as
 * the `SettingsBinding` provides it.
 */
export class SettingsModuleDemoViewController implements IViewController<ISettingsModuleDemoView> {
  private _controls: IControlsManager | null = null;
  private _uiEvents: UIEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
    this._uiEvents = resolver.getInstance(UIEvents);
  }

  public initialize(view: ISettingsModuleDemoView): void {
    if (!this._controls) {
      throw new Error("SettingsModuleDemoViewController is not initialized");
    }
    this._controls.clear();
    this._subs.add(view.onSettingsTapped(() => this._onSettingsTapped()));
  }

  public destroy(): void {
    this._subs.flush();
    this._controls = null;
    this._uiEvents = null;
  }

  private _onSettingsTapped(): void {
    this._uiEvents?.createPopup(SettingsUIIds.SettingsPopup);
  }
}
