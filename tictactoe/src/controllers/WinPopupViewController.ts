import { UnsubscribeBag, UIEvents, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IWinPopupView } from "../views/IWinPopupView";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import { GameTurnManagerToken, type GameTurnManager } from "../utilities/GameTurnManager.js";

export class WinPopupViewController implements IViewController<IWinPopupView> {
  private _view: IWinPopupView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameModel: IGameModelType | null = null;
  private _turnManager: GameTurnManager | null = null;
  private _uiEvents: UIEvents | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameModel = resolver.getInstance(IGameModel);
    this._turnManager = resolver.getInstance(GameTurnManagerToken);
    this._uiEvents = resolver.getInstance(UIEvents);
  }

  public initialize(view: IWinPopupView): void {
    this._view = view;
    this._view.setResult(this._gameModel?.winner ?? null);

    this._subs.add(this._view.onPlayAgain(() => this._onPlayAgain()));
  }

  private _onPlayAgain(): void {
    this._turnManager?.restart();
    this._uiEvents?.removeTopPopup();
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameModel = null;
    this._turnManager = null;
    this._uiEvents = null;
  }
}
