import { vector } from "@js-basics/vector";
import { GridEvents, GridsModel, RectGrid, RectGridPreset, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { Game2048Config } from "../Game2048Config.js";
import { GameBoardItem } from "../modules/gamegrid/models/GameBoardItem.js";
import { GameModel } from "../models/GameModel.js";

export type MoveDirection = "left" | "right" | "up" | "down";

export type SlideMove = {
  itemId: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  /** True if this tile is consumed by a merge at the destination cell. */
  absorbed: boolean;
};

export type MergeInfo = {
  row: number;
  col: number;
  newValue: number;
};

export type SpawnResult = {
  row: number;
  col: number;
  value: number;
  itemId: number;
};

export type MovePlan = {
  direction: MoveDirection;
  slides: SlideMove[];
  merges: MergeInfo[];
  scoreDelta: number;
  moved: boolean;
};

/**
 * 2048 in-domain logic on top of gamegrid {@link RectGrid} (cells hold {@link GameBoardItem}).
 *
 * Two-phase mutation:
 *  - {@link planMove} computes a plan from the current model state without mutating it,
 *    so the view can animate tiles from their original cells to the target cells.
 *  - {@link commitPlan} applies the plan to the model (and spawns one new tile) once
 *    the slide animation completes.
 *
 * This is a stateful in-app operations class (score / best / grid state + move
 * rules), not a service — it has no external I/O, so it lives in `utilities/`
 * with the `*Operations` suffix.
 *
 * Implements {@link IInjectionTarget}: the constructor takes no arguments. The
 * DI container creates the instance via the
 * `bindSingleton(GameOperations, () => new GameOperations())` factory and then
 * automatically calls `inject(resolver)` once. All dependencies (config, model,
 * grid events) are pulled in `inject`, the `RectGrid` is constructed and registered
 * with the model there, and the initial tiles are spawned.
 */
export class GameOperations implements IInjectionTarget {
  private _grid!: RectGrid;
  private _config!: Game2048Config;
  private _gameModel!: GameModel;
  private _nextItemId = 1;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(Game2048Config);
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
    this._grid = new RectGrid(Game2048Config.GRID_ID, preset, gridEvents);
    gridsModel.addGrid(this._grid);
    this._spawnInitialTiles();
  }

  public get grid(): RectGrid {
    return this._grid;
  }

  public setBest(best: number): void {
    this._gameModel.setBest(best);
  }

  public planMove(direction: MoveDirection): MovePlan {
    const slides: SlideMove[] = [];
    const merges: MergeInfo[] = [];
    let scoreDelta = 0;
    let moved = false;

    const lineCount = direction === "left" || direction === "right" ? this._config.rows : this._config.cols;
    for (let li = 0; li < lineCount; li++) {
      const lineCells = this._lineCells(direction, li);
      const lineItems: { item: GameBoardItem; row: number; col: number }[] = [];
      for (const lc of lineCells) {
        const cellItem = this._grid.getCell(lc.col, lc.row)?.item;
        if (cellItem instanceof GameBoardItem) lineItems.push({ item: cellItem, row: lc.row, col: lc.col });
      }

      let writeIdx = 0;
      let i = 0;
      while (i < lineItems.length) {
        const target = lineCells[writeIdx]!;
        const a = lineItems[i]!;
        const b = i + 1 < lineItems.length ? lineItems[i + 1]! : null;
        if (b !== null && a.item.value === b.item.value) {
          const newValue = a.item.value * 2;
          if (a.row !== target.row || a.col !== target.col) {
            slides.push({ itemId: a.item.itemId, fromRow: a.row, fromCol: a.col, toRow: target.row, toCol: target.col, absorbed: false });
            moved = true;
          }
          slides.push({ itemId: b.item.itemId, fromRow: b.row, fromCol: b.col, toRow: target.row, toCol: target.col, absorbed: true });
          merges.push({ row: target.row, col: target.col, newValue });
          scoreDelta += newValue;
          moved = true;
          i += 2;
        } else {
          if (a.row !== target.row || a.col !== target.col) {
            slides.push({ itemId: a.item.itemId, fromRow: a.row, fromCol: a.col, toRow: target.row, toCol: target.col, absorbed: false });
            moved = true;
          }
          i += 1;
        }
        writeIdx += 1;
      }
    }

    return { direction, slides, merges, scoreDelta, moved };
  }

  public commitPlan(plan: MovePlan): SpawnResult | null {
    if (!plan.moved) return null;

    // Snapshot all current items.
    const allItems: { item: GameBoardItem; row: number; col: number }[] = [];
    for (let r = 0; r < this._config.rows; r++) {
      for (let c = 0; c < this._config.cols; c++) {
        const it = this._grid.getCell(c, r)?.item;
        if (it instanceof GameBoardItem) allItems.push({ item: it, row: r, col: c });
      }
    }

    // Index destinations by item id.
    type Dest = { row: number; col: number; absorbed: boolean };
    const destByItemId = new Map<number, Dest>();
    for (const sl of plan.slides) {
      destByItemId.set(sl.itemId, { row: sl.toRow, col: sl.toCol, absorbed: sl.absorbed });
    }

    // Cells that are part of a merge — survivor is replaced with a fresh higher-value tile.
    const mergeKeys = new Set<string>();
    for (const mg of plan.merges) mergeKeys.add(this._key(mg.row, mg.col));

    // Clear the entire board so item-changed events don't reference stale positions.
    for (let r = 0; r < this._config.rows; r++) {
      for (let c = 0; c < this._config.cols; c++) {
        this._grid.setCellItem(c, r, null);
      }
    }

    // Place non-absorbed, non-merge-survivor items at their destinations.
    for (const ai of allItems) {
      const dest = destByItemId.get(ai.item.itemId);
      const finalRow = dest ? dest.row : ai.row;
      const finalCol = dest ? dest.col : ai.col;
      if (dest?.absorbed) continue;
      if (mergeKeys.has(this._key(finalRow, finalCol))) continue;
      this._grid.setCellItem(finalCol, finalRow, ai.item);
    }

    // Replace merge cells with fresh tiles holding the new value.
    for (const mg of plan.merges) {
      const merged = new GameBoardItem(this._nextItemId++, mg.newValue);
      this._grid.setCellItem(mg.col, mg.row, merged);
      this._gameModel.setHighestValue(mg.newValue);
    }

    this._gameModel.addScore(plan.scoreDelta);

    return this._spawnRandom();
  }

  public canMove(): boolean {
    // Empty cell exists?
    for (let r = 0; r < this._config.rows; r++) {
      for (let c = 0; c < this._config.cols; c++) {
        if (!this._grid.getCell(c, r)?.item) return true;
      }
    }
    // Any adjacent same-value pair?
    for (let r = 0; r < this._config.rows; r++) {
      for (let c = 0; c < this._config.cols; c++) {
        const v = this._valueAt(r, c);
        if (v < 0) continue;
        if (c + 1 < this._config.cols && this._valueAt(r, c + 1) === v) return true;
        if (r + 1 < this._config.rows && this._valueAt(r + 1, c) === v) return true;
      }
    }
    return false;
  }

  public reset(): void {
    for (let r = 0; r < this._config.rows; r++) {
      for (let c = 0; c < this._config.cols; c++) {
        this._grid.setCellItem(c, r, null);
      }
    }
    this._gameModel.reset();
    this._spawnInitialTiles();
  }

  private _spawnInitialTiles(): void {
    for (let i = 0; i < this._config.initialTileCount; i++) this._spawnRandom();
  }

  private _spawnRandom(): SpawnResult | null {
    const empties: { row: number; col: number }[] = [];
    for (let r = 0; r < this._config.rows; r++) {
      for (let c = 0; c < this._config.cols; c++) {
        if (!this._grid.getCell(c, r)?.item) empties.push({ row: r, col: c });
      }
    }
    if (empties.length === 0) return null;
    const pick = empties[Math.floor(Math.random() * empties.length)]!;
    const value = Math.random() < this._config.fourSpawnChance ? 4 : 2;
    const item = new GameBoardItem(this._nextItemId++, value);
    this._grid.setCellItem(pick.col, pick.row, item);
    this._gameModel.setHighestValue(value);
    return { row: pick.row, col: pick.col, value, itemId: item.itemId };
  }

  private _lineCells(direction: MoveDirection, lineIndex: number): { row: number; col: number }[] {
    // Returns cells from the "near" end (target side of the slide) to the "far" end.
    const cells: { row: number; col: number }[] = [];
    if (direction === "left") {
      for (let c = 0; c < this._config.cols; c++) cells.push({ row: lineIndex, col: c });
    } else if (direction === "right") {
      for (let c = this._config.cols - 1; c >= 0; c--) cells.push({ row: lineIndex, col: c });
    } else if (direction === "up") {
      for (let r = 0; r < this._config.rows; r++) cells.push({ row: r, col: lineIndex });
    } else {
      for (let r = this._config.rows - 1; r >= 0; r--) cells.push({ row: r, col: lineIndex });
    }
    return cells;
  }

  private _valueAt(row: number, col: number): number {
    const it = this._grid.getCell(col, row)?.item;
    return it instanceof GameBoardItem ? it.value : -1;
  }

  private _key(row: number, col: number): string {
    return `${row},${col}`;
  }
}
