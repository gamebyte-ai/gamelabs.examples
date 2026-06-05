import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";

import type { IFactoryScreenView } from "../views/IFactoryScreenView.js";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType, GameStatus } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";

/** HUD controller — reflects score/status from GameEvents onto the screen UI. */
export class FactoryScreenViewController implements IViewController<IFactoryScreenView> {
  private _view: IFactoryScreenView | null = null;
  private _model: IGameModelType | null = null;
  private _events: GameEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._model = resolver.getInstance(IGameModel);
    this._events = resolver.getInstance(GameEvents);
  }

  public initialize(view: IFactoryScreenView): void {
    this._view = view;
    view.setScore(this._model!.score);
    this._applyStatus(this._model!.status);

    this._subs.add(this._events!.onScoreChanged((n) => view.setScore(n)));
    this._subs.add(this._events!.onStatusChanged((s) => this._applyStatus(s)));
  }

  private _applyStatus(status: GameStatus): void {
    if (status === "won") this._view!.showBanner("Bin cleared!  —  tap to play again");
    else if (status === "lost") this._view!.showBanner("Tray full!  —  tap to retry");
    else this._view!.hideBanner();
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._model = null;
    this._events = null;
  }
}
