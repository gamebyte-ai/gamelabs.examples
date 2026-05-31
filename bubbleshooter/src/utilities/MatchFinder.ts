import type { IInjectionTarget, IInstanceResolver } from "@gamebyte/gamelabsjs";
import { BubbleColor } from "../constants/BubbleColor";
import { IBubbleGrid } from "../models/IBubbleGrid";
import { BubbleGridLayout } from "./BubbleGridLayout";

export interface IMatchedCell {
  readonly row: number;
  readonly col: number;
}

/**
 * Finds the connected group of same-coloured bubbles in the grid using
 * the layout's hex neighbour topology. Pure read-only over
 * {@link IBubbleGrid} — mutation belongs to whoever calls this.
 *
 * Implementation is a breadth-first flood from the seed cell, visiting
 * the six row-parity-aware neighbours per step.
 */
export class MatchFinder implements IInjectionTarget {
  private _grid: IBubbleGrid | null = null;
  private _layout: BubbleGridLayout | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._grid = resolver.getInstance(IBubbleGrid);
    this._layout = resolver.getInstance(BubbleGridLayout);
  }

  public findConnectedGroup(row: number, col: number): readonly IMatchedCell[] {
    const grid = this._grid;
    const layout = this._layout;
    if (!grid || !layout) return [];
    const seedColor = grid.getColor(row, col);
    // Stones never participate in colour matches.
    if (seedColor === null || seedColor === BubbleColor.Stone) return [];

    const visited = new Set<string>();
    const result: IMatchedCell[] = [];
    const queue: IMatchedCell[] = [{ row, col }];
    visited.add(this._key(row, col));

    while (queue.length > 0) {
      const cur = queue.shift()!;
      result.push(cur);
      const offsets = layout.getNeighborOffsets(cur.row);
      for (const off of offsets) {
        const nr = cur.row + off.dRow;
        const nc = cur.col + off.dCol;
        if (!layout.isInBounds(nr, nc)) continue;
        const key = this._key(nr, nc);
        if (visited.has(key)) continue;
        if (grid.getColor(nr, nc) !== seedColor) continue;
        visited.add(key);
        queue.push({ row: nr, col: nc });
      }
    }
    return result;
  }

  private _key(row: number, col: number): string {
    return `${row}|${col}`;
  }
}
