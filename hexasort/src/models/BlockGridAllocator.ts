import { BaseGrid, DefaultGridAllocator, GridCell, type IGridAllocator } from "@gamebyte/gamelabsjs";
import { HexaSortConfig } from "../HexaSortConfig.js";

/**
 * Allocator that gives every cell a stack capacity large enough to hold
 * a placed stack plus any additional blocks the sort step may push onto
 * it before the destruction threshold triggers. Capacity is set to the
 * destruction threshold so any pile shorter than that is always
 * representable.
 */
export class BlockGridAllocator extends DefaultGridAllocator implements IGridAllocator {
  private readonly _capacity: number;

  public constructor(config: HexaSortConfig) {
    super();
    this._capacity = config.destructionThreshold;
  }

  public override createCell(grid: BaseGrid, col: number, row: number, _capacity?: number): GridCell {
    return new GridCell(grid, col, row, this._capacity);
  }
}
