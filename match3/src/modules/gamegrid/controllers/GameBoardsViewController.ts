import type { IGridItem, IGridView, IInstanceResolver, IRectGrid } from "@gamebyte/gamelabsjs";
import { GridsViewController } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import { Match3AssetIds } from "../../../Match3AssetIds.js";
import { IGameModel } from "../../../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../../../models/IGameModel.js";
import { GameBoardItem } from "../models/GameBoardItem.js";
import { GameOperations } from "../../../utilities/GameOperations.js";
import { GameEvents } from "../../../events/GameEvents.js";
import { GameBoardItemObjectOptions } from "../views/GameBoardItemObjectOptions.js";
import type { IGameBoardsView } from "../views/IGameBoardsView.js";

export class GameBoardsViewController extends GridsViewController {
  private _gameModel: IGameModelType | null = null;
  private _operations: GameOperations | null = null;
  private _config: Match3Config | null = null;
  private _gameEvents: GameEvents | null = null;
  private _gridsView: IGameBoardsView | null = null;
  private _selected: { col: number; row: number } | null = null;
  private _inputLocked = false;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._gameModel = resolver.getInstance(IGameModel);
    this._operations = resolver.getInstance(GameOperations);
    this._config = resolver.getInstance(Match3Config);
    this._gameEvents = resolver.getInstance(GameEvents);
  }

  public override initialize(view: IGridView): void {
    super.initialize(view);
    this._gridsView = view as IGameBoardsView;
    this._gridsView.setCellPointerDownHandler((gridId, col, row) => this._onGridCellPointerDown(gridId, col, row));
  }

  protected override createItemObjectOption(item: IGridItem, grid: IRectGrid): GameBoardItemObjectOptions {
    if (!(item instanceof GameBoardItem)) throw new Error("Expected GameBoardItem");
    return new GameBoardItemObjectOptions(item.itemId, grid.preset, item.gemType);
  }

  private _onGridCellPointerDown(gridId: number, col: number, row: number): void {
    void this._handleGridCellAsync(gridId, col, row);
  }

  private async _handleGridCellAsync(gridId: number, col: number, row: number): Promise<void> {
    const svc = this._operations;
    const cfg = this._config;
    const view = this._gridsView;
    const events = this._gameEvents;
    if (!svc || !cfg || !view || !events || this._inputLocked) return;
    if (gridId !== Match3Config.GRID_ID) return;

    if (this._selected === null) {
      this._selected = { col, row };
      view.updateGemSelection(gridId, this._selected);
      events.emitPlaySfx(Match3AssetIds.SfxSelect);
      return;
    }

    if (this._selected.col === col && this._selected.row === row) {
      this._selected = null;
      view.updateGemSelection(gridId, null);
      return;
    }

    const r0 = this._selected.row;
    const c0 = this._selected.col;
    if (svc.isAdjacent(r0, c0, row, col)) {
      this._selected = null;
      view.updateGemSelection(gridId, null);
      this._inputLocked = true;
      try {
        const gridId = Match3Config.GRID_ID;
        if (svc.peekSwapCreatesMatch(r0, c0, row, col)) {
          events.emitPlaySfx(Match3AssetIds.SfxSwap);
          await view.animateValidSwap(gridId, r0, c0, row, col);
          svc.applySwap(r0, c0, row, col);
          await this._runMatchCascade(svc, events, view, gridId);
        } else {
          events.emitPlaySfx(Match3AssetIds.SfxWrong);
          await view.animateInvalidSwap(gridId, r0, c0, row, col);
        }
      } finally {
        this._inputLocked = false;
      }
      return;
    }

    this._selected = { col, row };
    view.updateGemSelection(gridId, this._selected);
  }

  private async _runMatchCascade(svc: GameOperations, events: GameEvents, view: IGameBoardsView, gridId: number): Promise<void> {
    while (svc.findMatches().length > 0) {
      const matches = svc.findMatches();
      events.emitPlaySfx(Match3AssetIds.SfxPop);
      await view.animateClearMatches(gridId, matches);
      svc.clearMatchedCells(matches);
      events.emitScoreChanged(this._gameModel!.score);
      const moves = svc.applyGravity();
      await view.animateGravityMoves(gridId, moves);
      const spawns = svc.refillEmpty();
      await view.animateRefillSpawns(gridId, spawns);
      events.emitScoreChanged(this._gameModel!.score);
    }
  }

  public override destroy(): void {
    this._gridsView?.setCellPointerDownHandler(null);
    this._gridsView = null;
    this._gameModel = null;
    this._operations = null;
    this._config = null;
    this._gameEvents = null;
    this._selected = null;
    super.destroy();
  }
}
