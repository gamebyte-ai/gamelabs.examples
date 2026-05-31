import { UnsubscribeBag, UIEvents, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import { WaterSortConfig } from "../WaterSortConfig.js";
import { WaterSortUIIds } from "../WaterSortUIIds.js";
import { GameOperations } from "../utilities/GameOperations.js";
import { GameEvents } from "../events/GameEvents.js";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _config: WaterSortConfig | null = null;
  private _gameModel: IGameModelType | null = null;
  private _ops: GameOperations | null = null;
  private _uiEvents: UIEvents | null = null;
  private _gameEvents: GameEvents | null = null;
  private _selectedBottle: number | null = null;
  private readonly _busyBottles = new Set<number>();
  private _pendingPours = 0;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(WaterSortConfig);
    this._gameModel = resolver.getInstance(IGameModel);
    this._ops = resolver.getInstance(GameOperations);
    this._uiEvents = resolver.getInstance(UIEvents);
    this._gameEvents = resolver.getInstance(GameEvents);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;

    this._subs.add(view.onBottleTapped((index) => this._handleBottleTap(index)));
    this._subs.add(view.onRestartTapped(() => this._gameEvents?.emitRestart()));
    this._subs.add(this._gameEvents!.onRestart(() => this._restartLevel()));
    this._subs.add(this._gameEvents!.onNextLevel(() => this._startLevel(this._gameModel!.level + 1)));

    this._startLevel(1);
  }

  private _startLevel(level: number): void {
    this._ops!.generateLevel(level);
    this._selectedBottle = null;
    this._busyBottles.clear();
    this._pendingPours = 0;
    this._refreshView();
  }

  private _restartLevel(): void {
    this._startLevel(this._gameModel!.level);
  }

  private _isBottleBusy(index: number): boolean {
    return this._busyBottles.has(index);
  }

  private _handleBottleTap(index: number): void {
    if (this._isBottleBusy(index)) return;

    if (this._selectedBottle === null) {
      if (!this._gameModel!.bottles[index]?.isEmpty) {
        this._selectedBottle = index;
        this._view?.animateSelect(index);
      }
      return;
    }

    if (this._selectedBottle === index) {
      const prev = this._selectedBottle;
      this._selectedBottle = null;
      this._view?.animateDeselect(prev);
      return;
    }

    const fromIdx = this._selectedBottle;
    if (this._isBottleBusy(fromIdx)) return;

    if (this._ops!.canPour(fromIdx, index)) {
      this._selectedBottle = null;
      this._busyBottles.add(fromIdx);
      this._busyBottles.add(index);
      this._pendingPours++;

      const fromBottle = this._gameModel!.bottles[fromIdx]!;
      const colorIdx = fromBottle.topColor!;
      const moved = this._ops!.pour(fromIdx, index);

      this._view?.animatePour(fromIdx, index, moved, colorIdx).then(() => this._onPourComplete(fromIdx, index));
    } else {
      this._handleInvalidPour(index);
    }
  }

  private _onPourComplete(fromIdx: number, toIdx: number): void {
    this._busyBottles.delete(fromIdx);
    this._busyBottles.delete(toIdx);
    this._pendingPours--;

    if (this._pendingPours === 0) {
      this._refreshView();

      if (this._ops!.isSolved()) {
        this._gameEvents?.emitWin(this._gameModel!.level, this._gameModel!.moves);
        this._uiEvents?.createPopup(WaterSortUIIds.WinPopup);
      }
    }
  }

  private _handleInvalidPour(index: number): void {
    const prev = this._selectedBottle!;
    if (!this._gameModel!.bottles[index]?.isEmpty) {
      this._selectedBottle = index;
      this._view?.animateDeselect(prev).then(() => this._view?.animateSelect(index));
    } else {
      this._selectedBottle = null;
      this._view?.animateDeselect(prev);
    }
  }

  private _refreshView(): void {
    this._view?.renderBottles(this._gameModel!.bottles, this._config!.liquidColors);
    this._view?.setLevel(this._gameModel!.level);
    this._view?.setMoves(this._gameModel!.moves);
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._config = null;
    this._gameModel = null;
    this._ops = null;
    this._uiEvents = null;
    this._gameEvents = null;
  }
}
