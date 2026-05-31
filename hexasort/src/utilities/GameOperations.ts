import { HexGrid, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { BlockItem } from "../models/BlockItem.js";
import { StacksTray } from "../models/StacksTray.js";
import type { BlockStack } from "../models/BlockStack.js";
import { BlockStackOperations } from "./BlockStackOperations.js";

/**
 * In-domain operations that mutate game state.
 *
 * Controllers access models through readonly interfaces (`IHexGrid`,
 * `IStacksTray`) and call `GameOperations` for every mutation. This
 * keeps the controller layer free of domain logic and concentrates all
 * game-state writes in a single, unit-testable utility — in-domain
 * operations belong in `utilities/` with the `*Operations` suffix.
 *
 * Holding the concrete mutable {@link HexGrid} / {@link StacksTray}
 * references here (not in controllers) is explicitly endorsed by the
 * rule: "The utility that owns the state exposes the readonly view."
 *
 * Mints {@link BlockItem} instances on placement so each block becomes a
 * tracked grid item with a back-reference to its cell.
 */
export class GameOperations implements IInjectionTarget {
  private _grid!: HexGrid;
  private _tray!: StacksTray;
  private _factory!: BlockStackOperations;
  private _nextItemId = 1;

  public inject(resolver: IInstanceResolver): void {
    this._grid = resolver.getInstance(HexGrid);
    this._tray = resolver.getInstance(StacksTray);
    this._factory = resolver.getInstance(BlockStackOperations);
  }

  /**
   * Placement rule: a stack may be dropped on a valid, empty cell. The
   * cell must exist in the grid and hold no blocks.
   */
  public canPlaceStack(col: number, row: number): boolean {
    if (!this._grid.isValidCell(col, row)) return false;
    return this._grid.getCell(col, row)?.size === 0;
  }

  /** Push every color in `stack` onto the grid cell as a fresh `BlockItem`. */
  public placeStackOnGrid(col: number, row: number, stack: BlockStack): void {
    for (const colorIndex of stack.colors) {
      this._grid.addCellItem(col, row, new BlockItem(this._nextItemId++, colorIndex));
    }
  }

  /**
   * Spawns a new random stack into the given tray slot and returns it so
   * the caller (tray controller) can hand it to the view.
   */
  public refillTraySlot(slotIndex: number): BlockStack {
    const replacement = this._factory.createRandomStack();
    this._tray.setSlot(slotIndex, replacement);
    return replacement;
  }
}
