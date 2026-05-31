import { UnsubscribeBag, UIEvents, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IWinPopupView } from "../views/IWinPopupView";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";

export class WinPopupViewController implements IViewController<IWinPopupView> {
  private _view: IWinPopupView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameModel: IGameModelType | null = null;
  private _uiEvents: UIEvents | null = null;
  private _gameEvents: GameEvents | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameModel = resolver.getInstance(IGameModel);
    this._uiEvents = resolver.getInstance(UIEvents);
    this._gameEvents = resolver.getInstance(GameEvents);
  }

  public initialize(view: IWinPopupView): void {
    this._view = view;
    this._view.setResult(this._gameModel!.level, this._gameModel!.moves);

    this._subs.add(this._view.onNextLevel(() => this._onNextLevel()));
  }

  private _onNextLevel(): void {
    this._uiEvents?.removeTopPopup();
    this._gameEvents?.emitNextLevel();
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameModel = null;
    this._uiEvents = null;
    this._gameEvents = null;
  }
}
