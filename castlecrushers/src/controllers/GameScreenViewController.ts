import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";

import type { IGameScreenView } from "../views/IGameScreenView.js";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType, GameStatus } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";

/** HUD controller — reflects ammo/status from GameEvents onto the screen UI. */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _model: IGameModelType | null = null;
  private _events: GameEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._model = resolver.getInstance(IGameModel);
    this._events = resolver.getInstance(GameEvents);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;

    // Initial state (order-independent of when the game view emits).
    view.setAmmo(this._model!.ammoLeft);
    this._applyStatus(this._model!.status);

    this._subs.add(this._events!.onAmmoChanged((n) => view.setAmmo(n)));
    this._subs.add(this._events!.onStatusChanged((s) => this._applyStatus(s)));
  }

  private _applyStatus(status: GameStatus): void {
    if (status === "won") this._view!.showBanner("Castle crushed!  —  tap to play again");
    else if (status === "lost") this._view!.showBanner("Out of cannonballs!  —  tap to retry");
    else this._view!.hideBanner();
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._model = null;
    this._events = null;
  }
}
