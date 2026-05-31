import { SettingsUIIds, UIEvents, UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView.js";

/**
 * Wires the HUD's settings-gear button to the settings popup via
 * {@link UIEvents.createPopup}. No other HUD logic in this milestone.
 */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _uiEvents: UIEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._uiEvents = resolver.getInstance(UIEvents);
  }

  public initialize(view: IGameScreenView): void {
    this._subs.add(
      view.onSettingsTapped(() => this._uiEvents?.createPopup(SettingsUIIds.SettingsPopup)),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._uiEvents = null;
  }
}
