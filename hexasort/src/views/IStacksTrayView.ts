import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { BlockStack } from "../models/BlockStack.js";

export interface IStacksTrayView extends IView {
  /** Builds visuals for the tray; `null` slots are empty. */
  buildTray(slots: readonly (BlockStack | null)[]): void;

  /** Fired when the pointer presses on a rendered stack (reports its slot). */
  onStackPressed(callback: (slotIndex: number) => void): Unsubscribe;

  /** Fired when the pointer is released while a stack is being dragged. */
  onPointerReleased(callback: () => void): Unsubscribe;

  /** Destroys the visual for a consumed slot (after a successful drop). */
  removeSlotVisual(slotIndex: number): void;

  /** Moves the visual back to its slot home (after a cancelled drop). */
  resetSlotVisual(slotIndex: number): void;

  /** Creates a fresh stack visual at the given slot's home position. */
  addSlotStack(slotIndex: number, stack: BlockStack): void;
}
