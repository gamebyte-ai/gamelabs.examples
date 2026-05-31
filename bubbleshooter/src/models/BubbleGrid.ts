import type { BubbleColor } from "../constants/BubbleColor";
import type { BubbleGridLayout } from "../utilities/BubbleGridLayout";
import type { IBubbleGrid } from "./IBubbleGrid";

/**
 * Mutable per-cell colour state for the bubble grid. Cell capacity is
 * exactly 1 colour or empty — multi-cell shapes / piles are not part of
 * the bubble shooter model.
 *
 * The {@link IBubbleGrid} interface exposes only readonly accessors;
 * mutation goes through {@link setColor} on the concrete class, which is
 * resolved only by `GameOperations`.
 *
 * Per-row column counts are sourced from the layout at construction
 * and again on every {@link rebuild} call. Levels can override the
 * layout's wide-row column count, so the grid must rebuild whenever
 * a level swap changes the width.
 */
export class BubbleGrid implements IBubbleGrid {
  private readonly _layout: BubbleGridLayout;
  public readonly rowCount: number;
  private _columnCounts: readonly number[] = [];
  private _cells: (BubbleColor | null)[][] = [];

  public constructor(layout: BubbleGridLayout) {
    this._layout = layout;
    this.rowCount = layout.rowCount;
    this.rebuild();
  }

  /**
   * Re-read per-row column counts from the layout and reset every
   * cell to empty. Call after `BubbleGridLayout.setWideRowColumns`
   * so the stored column counts match the new width.
   */
  public rebuild(): void {
    const layout = this._layout;
    const columnCounts: number[] = [];
    const cells: (BubbleColor | null)[][] = [];
    for (let r = 0; r < this.rowCount; r++) {
      const cols = layout.getColumnCount(r);
      columnCounts.push(cols);
      cells.push(new Array<BubbleColor | null>(cols).fill(null));
    }
    this._columnCounts = columnCounts;
    this._cells = cells;
  }

  public getColumnCount(row: number): number {
    return this._columnCounts[row] ?? 0;
  }

  public getColor(row: number, col: number): BubbleColor | null {
    const rowCells = this._cells[row];
    if (!rowCells) return null;
    if (col < 0 || col >= rowCells.length) return null;
    return rowCells[col] ?? null;
  }

  public isOccupied(row: number, col: number): boolean {
    return this.getColor(row, col) !== null;
  }

  public setColor(row: number, col: number, color: BubbleColor | null): void {
    const rowCells = this._cells[row];
    if (!rowCells) return;
    if (col < 0 || col >= rowCells.length) return;
    rowCells[col] = color;
  }
}
