import { UnsubscribeBag, UIEvents, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import { TurnEvents } from "../events/TurnEvents.js";
import { TicTacToeUIIds } from "../TicTacToeUIIds.js";
import { Team } from "../constants/Team.js";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameModel: IGameModelType | null = null;
  private _turnEvents: TurnEvents | null = null;
  private _uiEvents: UIEvents | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameModel = resolver.getInstance(IGameModel);
    this._turnEvents = resolver.getInstance(TurnEvents);
    this._uiEvents = resolver.getInstance(UIEvents);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;
    view.setActiveTeam(this._gameModel?.currentTeam ?? Team.X);

    this._subs.add(this._turnEvents?.onTurnChanged((team) => this._view?.setActiveTeam(team)));
    this._subs.add(this._turnEvents?.onGameWon(() => this._showWinPopup()));
    this._subs.add(this._turnEvents?.onGameDraw(() => this._showWinPopup()));
  }

  private _showWinPopup(): void {
    this._uiEvents?.createPopup(TicTacToeUIIds.WinPopup);
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameModel = null;
    this._turnEvents = null;
    this._uiEvents = null;
  }
}
