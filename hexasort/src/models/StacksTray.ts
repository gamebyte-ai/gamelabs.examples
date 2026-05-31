import type { BlockStack } from "./BlockStack.js";
import type { IStacksTray } from "./IStacksTray.js";

/**
 * Fixed-capacity tray of {@link BlockStack} slots shown at the bottom of
 * the screen. Consumed slots are left empty (`null`) — refill logic is out
 * of scope for this milestone.
 *
 * Controllers receive the readonly {@link IStacksTray}; the mutable
 * `setSlot` stays on this concrete class and is driven by `GameOperations`.
 */
export class StacksTray implements IStacksTray {
  public readonly slotCount: number;
  private readonly _slots: (BlockStack | null)[];

  public constructor(slotCount: number) {
    this.slotCount = slotCount;
    this._slots = [];
    for (let i = 0; i < slotCount; i++) this._slots.push(null);
  }

  public setSlot(index: number, stack: BlockStack | null): void {
    this._requireValid(index);
    this._slots[index] = stack;
  }

  public getSlot(index: number): BlockStack | null {
    this._requireValid(index);
    return this._slots[index]!;
  }

  public getAllSlots(): readonly (BlockStack | null)[] {
    return this._slots;
  }

  public findSlotByStackId(stackId: number): number {
    for (let i = 0; i < this._slots.length; i++) {
      if (this._slots[i]?.id === stackId) return i;
    }
    return -1;
  }

  private _requireValid(index: number): void {
    if (index < 0 || index >= this.slotCount) throw new Error(`Invalid tray slot ${index}`);
  }
}
