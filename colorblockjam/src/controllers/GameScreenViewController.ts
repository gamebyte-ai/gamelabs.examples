import {
  SettingsUIIds,
  UIEvents,
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { ColorBlockJamUIIds } from "../ColorBlockJamUIIds.js";
import { GameEvents } from "../events/GameEvents.js";
import { LevelManager } from "../utilities/LevelManager.js";
import type { IGameScreenView } from "../views/IGameScreenView.js";

/**
 * HUD-side controller.
 *
 * Responsibilities:
 *  - Writes the current level number + an instruction line into the header.
 *  - Shows the win popup when {@link GameEvents.onWin} fires.
 *  - Re-renders the header when {@link GameEvents.onLevelChanged} fires so
 *    the "Level N" label stays in sync across level transitions.
 */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _levels: LevelManager | null = null;
  private _gameEvents: GameEvents | null = null;
  private _uiEvents: UIEvents | null = null;
  private _view: IGameScreenView | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._levels = resolver.getInstance(LevelManager);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._uiEvents = resolver.getInstance(UIEvents);
  }

  public initialize(view: IGameScreenView): void {
    if (!this._levels || !this._gameEvents || !this._uiEvents) {
      throw new Error("GameScreenViewController is not initialized");
    }
    this._view = view;
    this._refreshHeader();

    this._subs.add(this._gameEvents.onWin(() => this._onWin()));
    this._subs.add(this._gameEvents.onLevelChanged(() => this._refreshHeader()));
    this._subs.add(view.onSettingsTapped(() => this._onSettingsTapped()));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._levels = null;
    this._gameEvents = null;
    this._uiEvents = null;
  }

  private _refreshHeader(): void {
    if (!this._view || !this._levels) return;
    this._view.setTitle(`Color Block Jam — Level ${this._levels.displayNumber} / ${this._levels.total}`);
    this._view.setSubtitle("Slide every block out through a door that matches its color and size.");
  }

  private _onWin(): void {
    this._uiEvents?.createPopup(ColorBlockJamUIIds.WinPopup);
  }

  private _onSettingsTapped(): void {
    this._uiEvents?.createPopup(SettingsUIIds.SettingsPopup);
  }
}
