import { vector } from "@js-basics/vector";
import { GridEvents, GridsModel, RectGrid, RectGridPreset, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../Match3Config.js";
import { GameBoardItem, GemSpecial } from "../modules/gamegrid/models/GameBoardItem.js";
import { GameModel } from "../models/GameModel.js";

export type GravityMove = { fromRow: number; fromCol: number; toRow: number; toCol: number; gemType: number };

export type RefillSpawn = { row: number; col: number; gemType: number };

export type Cell = { row: number; col: number };

/**
 * One straight line of 3+ same-coloured gems. `findMatches()` flattens every run
 * into a single cell list, which loses exactly what the special-gem rules need: how
 * long a line was and which way it ran.
 */
/**
 * A cell scheduled for clearing, with how far down the sweep it sits. `wave` 0 is the
 * match itself; a striped gem's sweep numbers its cells outward from the gem, which is
 * what lets the view clear them in order instead of all at once.
 */
export type SweepCell = Cell & { wave: number };

export type MatchRun = {
  readonly cells: readonly Cell[];
  readonly orientation: "row" | "column";
  readonly gemType: number;
};

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
      rowCount: this._config.totalRows,
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

  /** Every row, reserve included — cell coordinates are absolute. */
  public get rows(): number {
    return this._config.totalRows;
  }

  /** First playable row; everything above it is reserve. */
  public get firstVisibleRow(): number {
    return this._config.firstVisibleRow;
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

  /**
   * Whether swapping these two cells would put either of THEM in a line of three.
   *
   * Deliberately not "are there any matches on the board afterwards": mid-cascade the
   * board routinely holds matches that have not been consumed yet, so a board-wide test
   * called every swap legal and let invalid moves through — the gems traded places and
   * stayed there.
   */
  public peekSwapCreatesMatch(r1: number, c1: number, r2: number, c2: number): boolean {
    if (!this.isAdjacent(r1, c1, r2, c2)) return false;
    if (!this.isPlayable(r1) || !this.isPlayable(r2)) return false;

    this._swapItems(c1, r1, c2, r2);
    const ok = this._formsLineAt(c1, r1) || this._formsLineAt(c2, r2);
    this._swapItems(c1, r1, c2, r2);
    return ok;
  }

  /** Is the gem in this cell part of a run of three or more, in either direction? */
  private _formsLineAt(col: number, row: number): boolean {
    const t = this._gemAt(col, row);
    if (t < 0) return false;

    const run = (stepCol: number, stepRow: number): number => {
      let n = 0;
      for (let i = 1; ; i++) {
        const c = col + stepCol * i;
        const r = row + stepRow * i;
        if (c < 0 || c >= this._config.cols || !this.isPlayable(r)) break;
        if (this._gemAt(c, r) !== t) break;
        n++;
      }
      return n;
    };

    return 1 + run(-1, 0) + run(1, 0) >= 3 || 1 + run(0, -1) + run(0, 1) >= 3;
  }

  public applySwap(r1: number, c1: number, r2: number, c2: number): void {
    this._swapItems(c1, r1, c2, r2);
  }

  /**
   * The same matches as {@link findMatches}, but as individual runs instead of one
   * flattened cell set — run length decides which special a match produces, and the
   * orientation decides which way the resulting stripe sweeps.
   */
  public findMatchRuns(): MatchRun[] {
    const rows = this._config.totalRows;
    const cols = this._config.cols;
    const runs: MatchRun[] = [];

    // Reserve rows never match: the player cannot see them, so a chain there would
    // fire unseen and eat the level's authored contents.
    for (let row = this._config.firstVisibleRow; row < rows; row++) {
      let col = 0;
      while (col < cols) {
        const t = this._gemAt(col, row);
        let len = 1;
        while (col + len < cols && this._gemAt(col + len, row) === t) len++;
        if (len >= 3 && t >= 0) {
          const cells: Cell[] = [];
          for (let k = 0; k < len; k++) cells.push({ row, col: col + k });
          runs.push({ cells, orientation: "row", gemType: t });
        }
        col += len;
      }
    }

    for (let col = 0; col < cols; col++) {
      let row = this._config.firstVisibleRow;
      while (row < rows) {
        const t = this._gemAt(col, row);
        let len = 1;
        while (row + len < rows && this._gemAt(col, row + len) === t) len++;
        if (len >= 3 && t >= 0) {
          const cells: Cell[] = [];
          for (let k = 0; k < len; k++) cells.push({ row: row + k, col });
          runs.push({ cells, orientation: "column", gemType: t });
        }
        row += len;
      }
    }

    return runs;
  }

  /**
   * Whether a cell is in play. The reserve above the window holds the authored level;
   * nothing may clear it, mark it, or match in it — it only ever arrives by falling.
   */
  public isPlayable(row: number): boolean {
    return row >= this._config.firstVisibleRow && row <= this._config.lastVisibleRow;
  }

  /** Every playable cell holding a gem of `gemType`. The reserve is out of reach. */
  public visibleCellsOfType(gemType: number): Cell[] {
    const out: Cell[] = [];
    for (let row = this._config.firstVisibleRow; row <= this._config.lastVisibleRow; row++) {
      for (let col = 0; col < this._config.cols; col++) {
        if (this.gemTypeAt(row, col) === gemType) out.push({ row, col });
      }
    }
    return out;
  }

  /**
   * A colour picked from what is actually on the board, for a cookie set off by
   * something other than a swap — there is no partner gem to name a colour, so it
   * takes one at random from the gems in play.
   */
  public randomVisibleGemType(): number {
    const seen: number[] = [];
    for (let row = this._config.firstVisibleRow; row <= this._config.lastVisibleRow; row++) {
      for (let col = 0; col < this._config.cols; col++) {
        const t = this.gemTypeAt(row, col);
        if (t >= 0 && !seen.includes(t)) seen.push(t);
      }
    }
    if (seen.length === 0) return -1;
    return seen[Math.floor(Math.random() * seen.length)];
  }

  /** Identity of the gem in a cell, or -1. Lets callers tell "same cell" from "same gem". */
  public itemIdAt(row: number, col: number): number {
    const item = this._grid.getCell(col, row)?.item;
    return item instanceof GameBoardItem ? item.itemId : -1;
  }

  /** The special carried by the gem in a cell, or `None` if empty or plain. */
  public specialAt(row: number, col: number): GemSpecial {
    const item = this._grid.getCell(col, row)?.item;
    return item instanceof GameBoardItem ? item.special : GemSpecial.None;
  }

  /**
   * Grows a clear set by the rows and columns of any striped gems inside it, then
   * repeats — a stripe can uncover another stripe, and that one fires too. Returns
   * the closure, so the caller clears everything a single move sets off in one pass.
   */
  public expandSpecialClears(cells: readonly Cell[], bombColors?: ReadonlyMap<string, number>): SweepCell[] {
    const key = (c: Cell): string => `${c.row},${c.col}`;
    const out = new Map<string, SweepCell>();
    const pending: SweepCell[] = [];
    for (const c of cells) {
      const seed: SweepCell = { row: c.row, col: c.col, wave: 0 };
      out.set(key(seed), seed);
      pending.push(seed);
    }

    while (pending.length > 0) {
      const cell = pending.pop()!;
      const special = this.specialAt(cell.row, cell.col);
      if (special === GemSpecial.None) continue;

      // A sweep only ever reaches the playable window. A column sweep taken over the
      // whole grid would wipe that column's entire reserve — 40 rows of authored
      // level — for a clear the player never sees.
      const visibleRows = this._config.rows;
      let swept: Cell[];
      if (special === GemSpecial.ColorBomb) {
        // A swap names the colour (the gem it traded places with); anything else —
        // caught in a stripe, in a cascade — takes one from what is on the board.
        const named = bombColors?.get(key(cell));
        const target = named ?? this.randomVisibleGemType();
        swept = target < 0 ? [] : this.visibleCellsOfType(target);
      } else if (special === GemSpecial.StripedRow) {
        swept = Array.from({ length: this._config.cols }, (_, col) => ({ row: cell.row, col }));
      } else {
        swept = Array.from({ length: visibleRows }, (_, i) => ({ row: this._config.firstVisibleRow + i, col: cell.col }));
      }

      for (const s of swept) {
        if (!this._grid.getCell(s.col, s.row)?.item) continue;
        // Distance from the gem that fired, so the clear reads as travelling outward.
        const distance = Math.abs(s.row - cell.row) + Math.abs(s.col - cell.col);
        const wave = cell.wave + distance;
        const k = key(s);
        const seen = out.get(k);
        if (seen && seen.wave <= wave) continue;

        const next: SweepCell = { row: s.row, col: s.col, wave };
        out.set(k, next);
        pending.push(next);
      }
    }
    // Belt and braces: whatever fed the expansion, nothing outside the window leaves it.
    return [...out.values()].filter((c) => this.isPlayable(c.row));
  }

  /** Replaces a cell's gem with a special one of the same colour. */
  public createSpecial(row: number, col: number, gemType: number, special: GemSpecial): void {
    if (!this.isPlayable(row)) return;
    this._grid.setCellItem(col, row, new GameBoardItem(this._nextItemId++, gemType, special));
  }

  public clearMatchedCells(matches: { row: number; col: number }[]): void {
    // The reserve is off limits even if a caller asks — it is the level's contents.
    const playable = matches.filter((m) => this.isPlayable(m.row));
    if (playable.length === 0) return;
    this._gameModel.addScore(playable.length * this._config.scorePerGem);
    this._gameModel.addCleared(playable.length);
    for (const { row, col } of playable) {
      this._grid.setCellItem(col, row, null);
    }
  }

  /**
   * Compacts gems downward. `onlyCols` restricts the pass to those columns, which
   * is what lets two matches resolve side by side without touching each other's
   * gems — a column with no gaps is a no-op anyway, so the scoped and unscoped
   * results agree wherever they overlap.
   */
  public applyGravity(onlyCols?: ReadonlySet<number>): GravityMove[] {
    const rows = this._config.totalRows;
    const cols = this._config.cols;
    const moves: GravityMove[] = [];
    for (let col = 0; col < cols; col++) {
      if (onlyCols && !onlyCols.has(col)) continue;
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

  /** Fills empty cells with fresh gems. `onlyCols` scopes it, as in {@link applyGravity}. */
  public refillEmpty(onlyCols?: ReadonlySet<number>): RefillSpawn[] {
    const n = this._config.gemTypeCount;
    const spawns: RefillSpawn[] = [];
    for (let col = 0; col < this._config.cols; col++) {
      if (onlyCols && !onlyCols.has(col)) continue;
      for (let row = 0; row < this._config.totalRows; row++) {
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
    for (let row = 0; row < this._config.totalRows; row++) {
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
    const rows = this._config.totalRows;
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
      for (let row = 0; row < this._config.totalRows; row++) {
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
    const rows = this._config.totalRows;
    const cols = this._config.cols;
    const key = (r: number, c: number) => `${r},${c}`;
    const set = new Set<string>();

    // Reserve rows never match: the player cannot see them, so a chain there would
    // fire unseen and eat the level's authored contents.
    for (let row = this._config.firstVisibleRow; row < rows; row++) {
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
      let row = this._config.firstVisibleRow;
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
