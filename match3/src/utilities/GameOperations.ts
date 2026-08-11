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

/** The knobs {@link GameOperations.expandSpecialClears} takes beyond its seed cells. */
export type ExpandOptions = {
  /** Colour a cookie was told to take, keyed by cell — set by a swap, absent otherwise. */
  bombColors?: ReadonlyMap<string, number>;
  /** Whether a booster's surroundings are full enough for it to go off yet. */
  boosterReady?: (cell: Cell) => boolean;
  /** Reports each cookie that fires, the colour it chose and what it takes. */
  onCookieFired?: (from: Cell, colour: number, targets: readonly Cell[]) => void;
  /** Reports each bomb that fires, so a caller can decide whether it survives the blast. */
  onBoosterFired?: (from: Cell) => void;
  /** Cells already spoken for by another clear: reached, but never fired a second time. */
  skipCell?: (cell: Cell) => boolean;
  /** Colours another clear is already taking, so two cookies cannot pick the same one. */
  excludeColours?: ReadonlySet<number>;
};

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

  /**
   * The colour this cell matches on, or -1 for none.
   *
   * A cookie is COLOURLESS: it cannot be matched, it does not break or extend a line
   * through it, and a colour clear does not sweep it up. It still carries a gemType
   * internally — the visual uses it to pick a tint — but nothing on the board may read
   * that as "this is a red gem", which is why the check lives here, at the one accessor
   * every colour rule goes through, rather than being repeated at each of them.
   *
   * An empty cell answers -1 too: both mean "nothing here to match with".
   */
  public gemTypeAt(row: number, col: number): number {
    const item = this._grid.getCell(col, row)?.item;
    if (!item || !(item instanceof GameBoardItem)) return -1;
    return item.special === GemSpecial.ColorBomb ? -1 : item.gemType;
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
  /**
   * A colour currently on the board, at random. `exclude` holds the colours other
   * cookies are already taking — two going off at once must not pick the same one, or
   * the second finds nothing left to clear.
   *
   * Falls back to the full choice when every colour is excluded: better a repeat than a
   * cookie that does nothing.
   */
  public randomVisibleGemType(exclude?: ReadonlySet<number>): number {
    const seen: number[] = [];
    for (let row = this._config.firstVisibleRow; row <= this._config.lastVisibleRow; row++) {
      for (let col = 0; col < this._config.cols; col++) {
        const t = this.gemTypeAt(row, col);
        if (t >= 0 && !seen.includes(t)) seen.push(t);
      }
    }
    if (seen.length === 0) return -1;
    const free = exclude ? seen.filter((t) => !exclude.has(t)) : seen;
    const pool = free.length > 0 ? free : seen;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * The "+" two swapped stripes clear: every occupied playable cell on this cell's row
   * and on its column.
   *
   * Deliberately not "each stripe sweeps its own axis" — two row-stripes swapped would
   * then clear two parallel rows. The cross is anchored on the cell the swap landed on,
   * whichever way the two gems happened to be striped.
   *
   * `wave` is the distance from the crossing, so the clear travels outward from the
   * two stripes rather than taking the whole cross at once.
   */
  public plusCells(at: Cell): SweepCell[] {
    const out: SweepCell[] = [];
    for (let col = 0; col < this._config.cols; col++) {
      out.push({ row: at.row, col, wave: Math.abs(col - at.col) });
    }
    for (let i = 0; i < this._config.rows; i++) {
      const row = this._config.firstVisibleRow + i;
      if (row !== at.row) out.push({ row, col: at.col, wave: Math.abs(row - at.row) });
    }
    return out.filter((c) => this.isPlayable(c.row) && this.itemIdAt(c.row, c.col) >= 0);
  }

  /**
   * Where a `span`×`span` block centred on `at` actually sits. Pulled inside the
   * playable window when the swap happened near an edge, so the block is always whole —
   * a clipped one would clear fewer rows than columns and read as a bug.
   */
  public blockCentre(at: Cell, span: number): Cell {
    const half = Math.floor(span / 2);
    const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
    return {
      row: clamp(at.row, this._config.firstVisibleRow + half, this._config.lastVisibleRow - half),
      col: clamp(at.col, half, this._config.cols - 1 - half)
    };
  }

  /** Every cell of that block, whether or not it currently holds a gem. */
  public blockCells(at: Cell, span: number): Cell[] {
    const centre = this.blockCentre(at, span);
    const half = Math.floor(span / 2);
    const out: Cell[] = [];
    for (let row = centre.row - half; row <= centre.row + half; row++) {
      for (let col = centre.col - half; col <= centre.col + half; col++) {
        if (this.isPlayable(row) && col >= 0 && col < this._config.cols) out.push({ row, col });
      }
    }
    return out;
  }

  /**
   * The occupied cells on the block's rows, or on its columns, end to end — the block's
   * own cells included. While the item is still standing they are claimed, and the
   * caller drops claimed cells anyway; once it has gone they are part of the line like
   * any other cell, which is what makes the second wave clear its columns end to end.
   *
   * Every cell comes back at `wave` 0: all three lines go at once, so there is nothing
   * to stagger within a wave. The gap between the two waves is the caller's business.
   */
  public bandCells(at: Cell, span: number, axis: "row" | "column"): SweepCell[] {
    const centre = this.blockCentre(at, span);
    const half = Math.floor(span / 2);
    const out: SweepCell[] = [];
    for (let i = -half; i <= half; i++) {
      if (axis === "row") {
        const row = centre.row + i;
        for (let col = 0; col < this._config.cols; col++) {
          if (this.isPlayable(row) && this.itemIdAt(row, col) >= 0) out.push({ row, col, wave: 0 });
        }
      } else {
        const col = centre.col + i;
        for (let row = this._config.firstVisibleRow; row <= this._config.lastVisibleRow; row++) {
          if (this.itemIdAt(row, col) >= 0) out.push({ row, col, wave: 0 });
        }
      }
    }
    return out;
  }

  /**
   * The occupied playable cells within `radius` of `at`, as a SQUARE — what two bombs
   * going off together take.
   *
   * Not clamped like {@link blockCells}: a blast near an edge is clipped there rather
   * than slid inward, so it stays centred on the cell the player swapped.
   *
   * `wave` is the ring the cell sits on (Chebyshev distance), so the clear travels
   * outward from the middle a ring at a time instead of taking the square at once.
   */
  public areaCells(at: Cell, radius: number): SweepCell[] {
    const out: SweepCell[] = [];
    for (let row = at.row - radius; row <= at.row + radius; row++) {
      if (!this.isPlayable(row)) continue;
      for (let col = at.col - radius; col <= at.col + radius; col++) {
        if (col < 0 || col >= this._config.cols) continue;
        if (this.itemIdAt(row, col) < 0) continue;
        out.push({ row, col, wave: Math.max(Math.abs(row - at.row), Math.abs(col - at.col)) });
      }
    }
    return out;
  }

  /**
   * Every occupied playable cell, waved by COLUMN — what two cookies traded with each
   * other take: the whole board, sweeping left to right one column at a time.
   */
  public boardCellsLeftToRight(): SweepCell[] {
    const out: SweepCell[] = [];
    for (let col = 0; col < this._config.cols; col++) {
      for (let row = this._config.firstVisibleRow; row <= this._config.lastVisibleRow; row++) {
        if (this.itemIdAt(row, col) >= 0) out.push({ row, col, wave: col });
      }
    }
    return out;
  }

  /** Takes an item off the board without scoring it — the giant removing itself. */
  public removeItemAt(row: number, col: number): void {
    if (!this.isPlayable(row)) return;
    this._grid.setCellItem(col, row, null);
  }

  /** The up-to-8 playable cells around one, edges and the reserve excluded. */
  public neighbourCells(row: number, col: number): Cell[] {
    const out: Cell[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (c < 0 || c >= this._config.cols || !this.isPlayable(r)) continue;
        out.push({ row: r, col: c });
      }
    }
    return out;
  }

  /** How many of those neighbours currently hold a gem. */
  public occupiedNeighbourCount(row: number, col: number): number {
    return this.neighbourCells(row, col).filter((c) => this.itemIdAt(c.row, c.col) >= 0).length;
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
  public expandSpecialClears(
    // Seeds may carry their own `wave` — a cross already knows how far each of its
    // cells sits from the crossing. Anything without one starts the sweep at 0.
    cells: readonly (Cell & { wave?: number })[],
    // The model has no business knowing about bolts, but it is the only place that knows
    // WHICH cookie took WHICH gems — a caller that wants to draw that has nowhere else
    // to get it, hence `onCookieFired`.
    { bombColors, boosterReady, onCookieFired, onBoosterFired, skipCell, excludeColours }: ExpandOptions = {}
  ): SweepCell[] {
    const deferred = new Set<string>();
    /**
     * Cells whose special has already gone off in this pass. A booster fires ONCE: two
     * stripes crossing the same cookie reach it twice, and without this it would take a
     * second colour on the second visit. Waves still improve — only the firing is
     * one-shot.
     */
    const fired = new Set<string>();
    /** Colours taken here, so two cookies in one clear cannot pick the same one. */
    const taken = new Set<number>(excludeColours ?? []);
    const key = (c: Cell): string => `${c.row},${c.col}`;
    const out = new Map<string, SweepCell>();
    const pending: SweepCell[] = [];
    for (const c of cells) {
      const seed: SweepCell = { row: c.row, col: c.col, wave: c.wave ?? 0 };
      const seen = out.get(key(seed));
      if (seen && seen.wave <= seed.wave) continue;
      out.set(key(seed), seed);
      pending.push(seed);
    }

    while (pending.length > 0) {
      const cell = pending.pop()!;
      const special = this.specialAt(cell.row, cell.col);
      if (special === GemSpecial.None) continue;
      // One firing per gem, and none at all for a gem another clear already owns — it is
      // going off over there, not here.
      if (fired.has(key(cell)) || skipCell?.(cell)) continue;
      fired.add(key(cell));

      // A sweep only ever reaches the playable window. A column sweep taken over the
      // whole grid would wipe that column's entire reserve — 40 rows of authored
      // level — for a clear the player never sees.
      const visibleRows = this._config.rows;
      let swept: Cell[];
      if (special === GemSpecial.Booster) {
        // A booster waits for its neighbourhood to fill before going off. Until then it
        // is left on the board entirely — not cleared with the match that lit it.
        if (boosterReady && !boosterReady(cell)) {
          deferred.add(key(cell));
          continue;
        }
        swept = this.neighbourCells(cell.row, cell.col).filter((c) => this.itemIdAt(c.row, c.col) >= 0);
        onBoosterFired?.({ row: cell.row, col: cell.col });
      } else if (special === GemSpecial.ColorBomb) {
        // A swap names the colour (the gem it traded places with); anything else —
        // caught in a stripe, in a cascade — takes one from what is on the board.
        // Set off indirectly — caught in someone else's blast, with no partner to name a
        // colour. It picks one from what is on the board and takes that colour whole,
        // exactly as a swapped one would; only the choice of colour differs.
        const named = bombColors?.get(key(cell));
        const colour = named !== undefined ? named : this.randomVisibleGemType(taken);
        swept = colour >= 0 ? this.visibleCellsOfType(colour) : [];
        if (colour >= 0) taken.add(colour);
        onCookieFired?.({ row: cell.row, col: cell.col }, colour, swept);
      } else if (special === GemSpecial.GiantStripe) {
        // Runs its own two-wave routine and holds its block until it is done, so nothing
        // here may sweep on its behalf. Its cell stays in the clear set like any gem.
        continue;
      } else if (special === GemSpecial.StripedRow) {
        swept = Array.from({ length: this._config.cols }, (_, col) => ({ row: cell.row, col }));
      } else {
        swept = Array.from({ length: visibleRows }, (_, i) => ({ row: this._config.firstVisibleRow + i, col: cell.col }));
      }

      // A stripe or a booster travels outward from where it stands, so its cells are
      // numbered by distance. A cookie does not travel at all — it takes a COLOUR, and
      // the gems it takes are scattered over the board with no line between them. Timing
      // those by distance would trickle them in for no reason anyone could read, so they
      // all go together, which is also when the bolts thrown at them land.
      const spreads = special !== GemSpecial.ColorBomb;
      for (const s of swept) {
        if (!this._grid.getCell(s.col, s.row)?.item) continue;
        const distance = Math.abs(s.row - cell.row) + Math.abs(s.col - cell.col);
        const wave = cell.wave + (spreads ? distance : 0);
        const k = key(s);
        const seen = out.get(k);
        if (seen && seen.wave <= wave) continue;

        const next: SweepCell = { row: s.row, col: s.col, wave };
        out.set(k, next);
        pending.push(next);
      }
    }
    // Belt and braces: whatever fed the expansion, nothing outside the window leaves it.
    // A deferred booster is dropped so the match around it clears while it survives.
    return [...out.values()].filter((c) => this.isPlayable(c.row) && !deferred.has(key(c)));
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
   *
   * `isBlocked` marks cells another clear is in the middle of, and they behave as
   * SOLID: the gem in one does not move, an empty one is not filled, and neither lets
   * a gem pass through. Without it a staggered clear falls apart — the pass is
   * board-wide, so one chain's gravity would drag gems into the cells another chain
   * had already popped but not yet reached the end of, and that chain's remaining
   * steps would then clear whatever had slid in.
   */
  public applyGravity(onlyCols?: ReadonlySet<number>, isBlocked?: (row: number, col: number) => boolean): GravityMove[] {
    const rows = this._config.totalRows;
    const cols = this._config.cols;
    const moves: GravityMove[] = [];
    for (let col = 0; col < cols; col++) {
      if (onlyCols && !onlyCols.has(col)) continue;
      let write = rows - 1;
      for (let row = rows - 1; row >= 0; row--) {
        // A blocked cell ends the segment: gems above it rest ON it rather than
        // falling past, exactly as they would on a gem that is still there.
        if (isBlocked?.(row, col)) {
          write = row - 1;
          continue;
        }
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

  /**
   * Fills empty cells with fresh gems. `onlyCols` scopes it, as in {@link applyGravity};
   * `isBlocked` means the same thing there and here.
   *
   * New gems enter from above, so a blocked cell stops the column: everything under it
   * is unreachable this pass and stays empty until the clear holding it finishes. Filling
   * past it would have gems appear out of nowhere BELOW something still being popped.
   */
  public refillEmpty(onlyCols?: ReadonlySet<number>, isBlocked?: (row: number, col: number) => boolean): RefillSpawn[] {
    const n = this._config.gemTypeCount;
    const spawns: RefillSpawn[] = [];
    for (let col = 0; col < this._config.cols; col++) {
      if (onlyCols && !onlyCols.has(col)) continue;
      for (let row = 0; row < this._config.totalRows; row++) {
        if (isBlocked?.(row, col)) break;
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
    this._applyDebugGemTypeLimit();
    if (this._config.debugSeedBoosters) this._seedBoosterPair();
  }

  /**
   * Thins one colour down to a fixed count across the PLAYABLE window, recolouring the
   * rest. Replacements avoid making a triple, so the board still opens without a match
   * already on it.
   */
  private _applyDebugGemTypeLimit(): void {
    const limit = this._config.debugLimitGemType;
    if (limit.count < 0) return;

    let seen = 0;
    for (let row = this._config.firstVisibleRow; row <= this._config.lastVisibleRow; row++) {
      for (let col = 0; col < this._config.cols; col++) {
        if (this.gemTypeAt(row, col) !== limit.gemType) continue;
        if (seen++ < limit.count) continue;

        for (let guard = 0; guard < 30; guard++) {
          const t = Math.floor(Math.random() * this._config.gemTypeCount);
          if (t === limit.gemType || this._wouldCreateTripleAt(col, row, t)) continue;
          this._grid.setCellItem(col, row, this._createItem(t));
          break;
        }
      }
    }
  }

  /**
   * Drops a cookie next to a stripe in the middle of the board. Purely a test aid —
   * waiting for both to occur naturally makes the pairing slow to try.
   */
  private _seedBoosterPair(): void {
    const row = this._config.firstVisibleRow + Math.floor(this._config.rows / 2);
    const col = Math.max(0, Math.floor(this._config.cols / 2) - 1);
    if (col + 1 >= this._config.cols) return;

    // One bomb on its own, in a colour the board has plenty of, so it is easy to bring
    // a third gem to it and set it off. Matching it is the only way in — a bomb swapped
    // with an ordinary gem does nothing unless that swap makes a line.
    this.createSpecial(row, col, 0, GemSpecial.Booster);
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

  /** Column-first spelling of {@link gemTypeAt}, which the match scans read through. */
  private _gemAt(col: number, row: number): number {
    return this.gemTypeAt(row, col);
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
