import { UnsubscribeBag, UIEvents, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameOverPopupView } from "../views/IGameOverPopupView";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";
import { WaveManager } from "../utilities/WaveManager.js";

export class GameOverPopupViewController implements IViewController<IGameOverPopupView> {
  private _view: IGameOverPopupView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameModel: IGameModelType | null = null;
  private _uiEvents: UIEvents | null = null;
  private _gameEvents: GameEvents | null = null;
  private _waveManager: WaveManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameModel = resolver.getInstance(IGameModel);
    this._uiEvents = resolver.getInstance(UIEvents);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._waveManager = resolver.getInstance(WaveManager);
  }

  public initialize(view: IGameOverPopupView): void {
    this._view = view;
    this._view.setWave(this._waveManager?.currentWave ?? 0);

    this._subs.add(this._view.onPlayAgain(() => this._onPlayAgain()));
  }

  private _onPlayAgain(): void {
    this._uiEvents?.removeTopPopup();
    this._gameEvents?.emitRestart();
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameModel = null;
    this._uiEvents = null;
    this._gameEvents = null;
    this._waveManager = null;
  }
}
