import type { IInjectionTarget, IInstanceResolver } from "@gamebyte/gamelabsjs";
import { IBubbleGrid } from "../models/IBubbleGrid";
import { BubbleGridLayout } from "./BubbleGridLayout";

export interface IFloatingCell {
  readonly row: number;
  readonly col: number;
}

/**
 * Finds occupied cells that have lost their connection to the top row.
 *
 * Connectivity is shape-only (colour-agnostic): BFS floods through
 * adjacent occupied cells starting from every occupied cell in row 0.
 * Whatever's occupied but unreached is floating and should drop.
 *
 * Pure read-only over {@link IBubbleGrid} — mutation belongs to the
 * caller.
 */
export class FloatingBubbleFinder implements IInjectionTarget {
  private _grid: IBubbleGrid | null = null;
  private _layout: BubbleGridLayout | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._grid = resolver.getInstance(IBubbleGrid);
    this._layout = resolver.getInstance(BubbleGridLayout);
  }

  public findFloating(): readonly IFloatingCell[] {
    const grid = this._grid;
    const layout = this._layout;
    if (!grid || !layout) return [];

    const reachable = new Set<string>();
    const queue: IFloatingCell[] = [];

    const topCols = grid.getColumnCount(0);
    for (let col = 0; col < topCols; col++) {
      if (!grid.isOccupied(0, col)) continue;
      const key = this._key(0, col);
      reachable.add(key);
      queue.push({ row: 0, col });
    }

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const offsets = layout.getNeighborOffsets(cur.row);
      for (const off of offsets) {
        const nr = cur.row + off.dRow;
        const nc = cur.col + off.dCol;
        if (!layout.isInBounds(nr, nc)) continue;
        if (!grid.isOccupied(nr, nc)) continue;
        const key = this._key(nr, nc);
        if (reachable.has(key)) continue;
        reachable.add(key);
        queue.push({ row: nr, col: nc });
      }
    }

    const floating: IFloatingCell[] = [];
    for (let row = 0; row < grid.rowCount; row++) {
      const colCount = grid.getColumnCount(row);
      for (let col = 0; col < colCount; col++) {
        if (!grid.isOccupied(row, col)) continue;
        if (!reachable.has(this._key(row, col))) floating.push({ row, col });
      }
    }
    return floating;
  }

  private _key(row: number, col: number): string {
    return `${row}|${col}`;
  }
}
