import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { BlockStack } from "./BlockStack.js";

/**
 * Readonly view of the stacks tray. Controllers and views receive this
 * interface; the concrete {@link StacksTray} with `setSlot` is held only
 * by the `GameOperations` utility.
 */
export interface IStacksTray {
  readonly slotCount: number;
  getSlot(index: number): BlockStack | null;
  /** Snapshot of every slot in order. The caller must not mutate it. */
  getAllSlots(): readonly (BlockStack | null)[];
  findSlotByStackId(stackId: number): number;
}

export const IStacksTray = new InjectionToken<IStacksTray>("IStacksTray");
