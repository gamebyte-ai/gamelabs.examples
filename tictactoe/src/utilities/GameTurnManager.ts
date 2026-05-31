import { InjectionToken, GridsModel, type IInstanceResolver, type IInjectionTarget } from "@gamebyte/gamelabsjs";
import { GameGridAllocator } from "../modules/gamegrid/utilities/GameGridAllocator.js";
import { GameItem } from "../modules/gamegrid/models/GameItem.js";
import { Team } from "../constants/Team.js";
import { GameModel } from "../models/GameModel.js";
import { TicTacToeConfig } from "../TicTacToeConfig.js";
import { TurnEvents } from "../events/TurnEvents.js";

export const GameTurnManagerToken = new InjectionToken<GameTurnManager>("GameTurnManager");

export class GameTurnManager implements IInjectionTarget {
  private _gridsModel: GridsModel | null = null;
  private _config: TicTacToeConfig | null = null;
  private _turnEvents: TurnEvents | null = null;
  private _gameModel: GameModel | null = null;
  private readonly _allocator = new GameGridAllocator();
  private _nextItemId = 1;

  public inject(resolver: IInstanceResolver): void {
    this._gridsModel = resolver.getInstance(GridsModel);
    this._config = resolver.getInstance(TicTacToeConfig);
    this._turnEvents = resolver.getInstance(TurnEvents);
    this._gameModel = resolver.getInstance(GameModel);
  }

  public placeMark(gridId: number, col: number, row: number): boolean {
    if (!this._gameModel || this._gameModel.gameOver) return false;

    const grid = this._gridsModel?.getGrid(gridId);
    if (!grid || gridId !== this._config?.boardId) return false;

    const cell = grid.getCell(col, row);
    if (!cell || cell.item) return false;

    const placedTeam = this._gameModel.currentTeam;
    const item = this._allocator.createItem({ id: this._nextItemId++, team: placedTeam }) as GameItem;
    grid.setCellItem(col, row, item);

    const winner = this._checkWinner(gridId);
    if (winner) {
      this._gameModel.setGameOver(true);
      this._gameModel.setWinner(winner);
      this._turnEvents?.emitGameWon(winner);
      return true;
    }

    if (this._isBoardFull(gridId)) {
      this._gameModel.setGameOver(true);
      this._gameModel.setWinner(null);
      this._turnEvents?.emitGameDraw();
      return true;
    }

    this._gameModel.setCurrentTeam(placedTeam === Team.X ? Team.O : Team.X);
    this._turnEvents?.emitTurnChanged(this._gameModel.currentTeam);
    return true;
  }

  public restart(): void {
    const grid = this._gridsModel?.getGrid(this._config?.boardId ?? -1);
    if (!grid) return;

    for (let col = 0; col < grid.columnCount; col++) {
      for (let row = 0; row < grid.rowCount; row++) {
        if (grid.getCell(col, row)?.item) {
          grid.setCellItem(col, row, null);
        }
      }
    }

    this._gameModel?.reset();
    this._turnEvents?.emitGameRestarted();
    this._turnEvents?.emitTurnChanged(this._gameModel?.currentTeam ?? Team.X);
  }

  private _checkWinner(gridId: number): Team | null {
    const grid = this._gridsModel?.getGrid(gridId);
    if (!grid) return null;

    const cols = grid.columnCount;
    const rows = grid.rowCount;

    const getTeam = (col: number, row: number): Team | null => {
      const item = grid.getCell(col, row)?.item;
      return item instanceof GameItem ? item.team : null;
    };

    for (let row = 0; row < rows; row++) {
      const team = getTeam(0, row);
      if (team && this._allMatch(team, cols, (i) => getTeam(i, row))) return team;
    }

    for (let col = 0; col < cols; col++) {
      const team = getTeam(col, 0);
      if (team && this._allMatch(team, rows, (i) => getTeam(col, i))) return team;
    }

    if (cols === rows) {
      const tl = getTeam(0, 0);
      if (tl && this._allMatch(tl, cols, (i) => getTeam(i, i))) return tl;

      const tr = getTeam(cols - 1, 0);
      if (tr && this._allMatch(tr, cols, (i) => getTeam(cols - 1 - i, i))) return tr;
    }

    return null;
  }

  private _allMatch(team: Team, count: number, getter: (i: number) => Team | null): boolean {
    for (let i = 0; i < count; i++) {
      if (getter(i) !== team) return false;
    }
    return true;
  }

  private _isBoardFull(gridId: number): boolean {
    const grid = this._gridsModel?.getGrid(gridId);
    if (!grid) return false;

    for (let col = 0; col < grid.columnCount; col++) {
      for (let row = 0; row < grid.rowCount; row++) {
        if (!grid.getCell(col, row)?.item) return false;
      }
    }
    return true;
  }
}
