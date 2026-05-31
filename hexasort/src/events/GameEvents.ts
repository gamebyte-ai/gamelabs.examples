import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import type { BlockStack } from "../models/BlockStack.js";

/**
 * Cross-controller game events.
 *
 * Drag-and-drop:
 * - `onStackPickedUp`   — Stacks tray → grid: a stack is being dragged.
 *   Grid controller uses this to suppress rotation and enter "drop mode".
 * - `onStackReleased`   — Stacks tray → grid: the pointer was released.
 *   Grid controller decides whether the current hover is a valid drop.
 * - `onStackPlaced`     — Grid → stacks tray: a stack was written into a
 *   cell and should be removed from its tray slot.
 * - `onStackDropCancelled` — Grid → stacks tray: the drop was not valid.
 *   Stacks tray returns the stack to its slot.
 *
 * Sorting animations:
 * - `onSortMoveStarted`     — SortingManager → grid view controller:
 *   a block has just been popped from source and pushed onto target in
 *   the model. The view should animate a block travelling between them.
 * - `onBlockDestroyStarted` — SortingManager → grid view controller:
 *   the top block at a cell has just been popped in the model. The
 *   view should animate its destruction.
 *
 * The sort events carry only primitive coordinates so the
 * SortingManager never has to import view types — it emits state
 * changes, and the HexGridViewController translates them into view
 * calls. This decoupling keeps domain state advancement (model pop/
 * push) independent from rendering.
 */
export class GameEvents {
  private readonly _pickedUp = new Set<(stack: BlockStack) => void>();
  private readonly _released = new Set<() => void>();
  private readonly _placed = new Set<(stack: BlockStack, col: number, row: number) => void>();
  private readonly _dropCancelled = new Set<(stack: BlockStack) => void>();
  private readonly _sortMoveStarted = new Set<
    (srcCol: number, srcRow: number, tgtCol: number, tgtRow: number, colorIndex: number) => void
  >();
  private readonly _blockDestroyStarted = new Set<(col: number, row: number) => void>();

  public onStackPickedUp(cb: (stack: BlockStack) => void): Unsubscribe {
    this._pickedUp.add(cb);
    return () => this._pickedUp.delete(cb);
  }

  public emitStackPickedUp(stack: BlockStack): void {
    for (const cb of this._pickedUp) cb(stack);
  }

  public onStackReleased(cb: () => void): Unsubscribe {
    this._released.add(cb);
    return () => this._released.delete(cb);
  }

  public emitStackReleased(): void {
    for (const cb of this._released) cb();
  }

  public onStackPlaced(cb: (stack: BlockStack, col: number, row: number) => void): Unsubscribe {
    this._placed.add(cb);
    return () => this._placed.delete(cb);
  }

  public emitStackPlaced(stack: BlockStack, col: number, row: number): void {
    for (const cb of this._placed) cb(stack, col, row);
  }

  public onStackDropCancelled(cb: (stack: BlockStack) => void): Unsubscribe {
    this._dropCancelled.add(cb);
    return () => this._dropCancelled.delete(cb);
  }

  public emitStackDropCancelled(stack: BlockStack): void {
    for (const cb of this._dropCancelled) cb(stack);
  }

  public onSortMoveStarted(
    cb: (srcCol: number, srcRow: number, tgtCol: number, tgtRow: number, colorIndex: number) => void,
  ): Unsubscribe {
    this._sortMoveStarted.add(cb);
    return () => this._sortMoveStarted.delete(cb);
  }

  public emitSortMoveStarted(
    srcCol: number, srcRow: number, tgtCol: number, tgtRow: number, colorIndex: number,
  ): void {
    for (const cb of this._sortMoveStarted) cb(srcCol, srcRow, tgtCol, tgtRow, colorIndex);
  }

  public onBlockDestroyStarted(cb: (col: number, row: number) => void): Unsubscribe {
    this._blockDestroyStarted.add(cb);
    return () => this._blockDestroyStarted.delete(cb);
  }

  public emitBlockDestroyStarted(col: number, row: number): void {
    for (const cb of this._blockDestroyStarted) cb(col, row);
  }
}
