import { vector } from "@js-basics/vector";
import { GridEvents, GridsModel, RectGrid, RectGridPreset, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../Match3Config.js";
import { GameBoardItem } from "../modules/gamegrid/models/GameBoardItem.js";
import { GameModel } from "../models/GameModel.js";

export type GravityMove = { fromRow: number; fromCol: number; toRow: number; toCol: number; gemType: number };

export type RefillSpawn = { row: number; col: number; gemType: number };

/**
 * Match-3 in-domain logic on top of gamegrid {@link RectGrid} (cells hold {@link GameBoardItem}).
 *
 * This is a stateful in-app operations class (score + grid state + match rules),
 * not a service — it has no external I/O, so it lives in `utilities/` with the
 * `*Operations` suffix.
 *
 * Implements {@link IInjectionTarget}: the constructor takes no arguments. The
 * DI container creates the instance via the
 * `bindSingleton(GameOperations, () => new GameOperations())` factory and then
 * automatically calls `inject(resolver)` once. All dependencies (config, model,
 * grid events) are pulled in `inject`, the `RectGrid` is constructed and registered
 * with the model there, and the initial board (with no pre-existing matches) is
 * filled.
 */
export class GameOperations implements IInjectionTarget {
  private _grid!: RectGrid;
  private _config!: Match3Config;
  private _gameModel!: GameModel;
  private _nextItemId = 1;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(Match3Config);
    this._gameModel = resolver.getInstance(GameModel);
    const gridsModel = resolver.getInstance(GridsModel);
    const gridEvents = resolver.getInstance(GridEvents);
    const preset = new RectGridPreset({
      columnCount: this._config.cols,
      rowCount: this._config.rows,
      columnSize: this._config.gridColumnSize,
      rowSize: this._config.gridRowSize,
      columnAxis: vector(1, 0, 0),
      rowAxis: vector(0, 0, 1),
    });
    this._grid = new RectGrid(Match3Config.GRID_ID, preset, gridEvents);
    gridsModel.addGrid(this._grid);
    this._fillInitialNoMatches();
  }

  public get grid(): RectGrid {
    return this._grid;
  }

  public get rows(): number {
    return this._config.rows;
  }

  public get cols(): number {
    return this._config.cols;
  }

  public gemTypeAt(row: number, col: number): number {
    const item = this._grid.getCell(col, row)?.item;
    if (!item || !(item instanceof GameBoardItem)) return -1;
    return item.gemType;
  }

  public isAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }

  public peekSwapCreatesMatch(r1: number, c1: number, r2: number, c2: number): boolean {
    if (!this.isAdjacent(r1, c1, r2, c2)) return false;
    this._swapItems(c1, r1, c2, r2);
    const ok = this._findMatchCells().length > 0;
    this._swapItems(c1, r1, c2, r2);
    return ok;
  }

  public applySwap(r1: number, c1: number, r2: number, c2: number): void {
    this._swapItems(c1, r1, c2, r2);
  }

  public findMatches(): { row: number; col: number }[] {
    return this._findMatchCells();
  }

  public clearMatchedCells(matches: { row: number; col: number }[]): void {
    if (matches.length === 0) return;
    this._gameModel.addScore(matches.length * this._config.scorePerGem);
    for (const { row, col } of matches) {
      this._grid.setCellItem(col, row, null);
    }
  }

  public applyGravity(): GravityMove[] {
    const rows = this._config.rows;
    const cols = this._config.cols;
    const moves: GravityMove[] = [];
    for (let col = 0; col < cols; col++) {
      let write = rows - 1;
      for (let row = rows - 1; row >= 0; row--) {
        const cell = this._grid.getCell(col, row);
        if (!cell?.item) continue;
        const item = cell.item;
        const gemType = item instanceof GameBoardItem ? item.gemType : 0;
        if (write !== row) {
          moves.push({ fromRow: row, fromCol: col, toRow: write, toCol: col, gemType });
          this._grid.setCellItem(col, row, null);
          this._grid.setCellItem(col, write, item);
        }
        write--;
      }
    }
    return moves;
  }

  public refillEmpty(): RefillSpawn[] {
    const n = this._config.gemTypeCount;
    const spawns: RefillSpawn[] = [];
    for (let col = 0; col < this._config.cols; col++) {
      for (let row = 0; row < this._config.rows; row++) {
        const cell = this._grid.getCell(col, row);
        if (cell?.item) continue;
        const t = Math.floor(Math.random() * n);
        const item = new GameBoardItem(this._nextItemId++, t);
        this._grid.setCellItem(col, row, item);
        spawns.push({ row, col, gemType: t });
      }
    }
    return spawns;
  }

  private _createItem(gemType: number): GameBoardItem {
    return new GameBoardItem(this._nextItemId++, gemType);
  }

  private _swapItems(col1: number, row1: number, col2: number, row2: number): void {
    const cell1 = this._grid.getCell(col1, row1)!;
    const cell2 = this._grid.getCell(col2, row2)!;
    const a = cell1.item;
    const b = cell2.item;
    this._grid.setCellItem(col1, row1, null);
    this._grid.setCellItem(col2, row2, null);
    this._grid.setCellItem(col1, row1, b);
    this._grid.setCellItem(col2, row2, a);
  }

  private _fillInitialNoMatches(): void {
    const n = this._config.gemTypeCount;
    for (let row = 0; row < this._config.rows; row++) {
      for (let col = 0; col < this._config.cols; col++) {
        let t = 0;
        let guard = 0;
        do {
          t = Math.floor(Math.random() * n);
          guard++;
        } while (guard < 50 && this._wouldCreateTripleAt(col, row, t));
        this._grid.setCellItem(col, row, this._createItem(t));
      }
    }
    while (this._findMatchCells().length > 0) {
      this._resolveAllMatchesSync();
    }
    this._gameModel.resetScore();
  }

  private _resolveAllMatchesSync(): void {
    while (true) {
      const matches = this._findMatchCells();
      if (matches.length === 0) break;
      this._gameModel.addScore(matches.length * this._config.scorePerGem);
      for (const { row, col } of matches) {
        this._grid.setCellItem(col, row, null);
      }
      this._applyGravitySync();
      this._refillSync();
    }
  }

  private _applyGravitySync(): void {
    const rows = this._config.rows;
    const cols = this._config.cols;
    for (let col = 0; col < cols; col++) {
      let write = rows - 1;
      for (let row = rows - 1; row >= 0; row--) {
        const cell = this._grid.getCell(col, row);
        if (!cell?.item) continue;
        const item = cell.item;
        if (write !== row) {
          this._grid.setCellItem(col, row, null);
          this._grid.setCellItem(col, write, item);
        }
        write--;
      }
    }
  }

  private _refillSync(): void {
    const n = this._config.gemTypeCount;
    for (let col = 0; col < this._config.cols; col++) {
      for (let row = 0; row < this._config.rows; row++) {
        const cell = this._grid.getCell(col, row);
        if (cell?.item) continue;
        this._grid.setCellItem(col, row, this._createItem(Math.floor(Math.random() * n)));
      }
    }
  }

  private _wouldCreateTripleAt(col: number, row: number, type: number): boolean {
    if (col >= 2) {
      const a = this._gemAt(col - 1, row);
      const b = this._gemAt(col - 2, row);
      if (a === type && b === type) return true;
    }
    if (row >= 2) {
      const a = this._gemAt(col, row - 1);
      const b = this._gemAt(col, row - 2);
      if (a === type && b === type) return true;
    }
    return false;
  }

  private _gemAt(col: number, row: number): number {
    const item = this._grid.getCell(col, row)?.item;
    if (!item || !(item instanceof GameBoardItem)) return -1;
    return item.gemType;
  }

  private _findMatchCells(): { row: number; col: number }[] {
    const rows = this._config.rows;
    const cols = this._config.cols;
    const key = (r: number, c: number) => `${r},${c}`;
    const set = new Set<string>();

    for (let row = 0; row < rows; row++) {
      let col = 0;
      while (col < cols) {
        const t = this._gemAt(col, row);
        let len = 1;
        while (col + len < cols && this._gemAt(col + len, row) === t) len++;
        if (len >= 3 && t >= 0) {
          for (let k = 0; k < len; k++) set.add(key(row, col + k));
        }
        col += len;
      }
    }

    for (let col = 0; col < cols; col++) {
      let row = 0;
      while (row < rows) {
        const t = this._gemAt(col, row);
        let len = 1;
        while (row + len < rows && this._gemAt(col, row + len) === t) len++;
        if (len >= 3 && t >= 0) {
          for (let k = 0; k < len; k++) set.add(key(row + k, col));
        }
        row += len;
      }
    }

    return [...set].map((s) => {
      const [rStr, cStr] = s.split(",");
      return { row: Number(rStr), col: Number(cStr) };
    });
  }
}
