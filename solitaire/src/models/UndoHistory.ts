import type { UndoRecord } from "./UndoRecord";

/**
 * Stack of reversible operations in the order they were applied.
 * `push` records the most recent operation; `pop` removes and returns
 * the top of the stack. The BoardViewController is the sole writer
 * (records each move / draw / recycle as it commits) and the sole
 * consumer (pops the top in response to an undo request).
 */
export class UndoHistory {
  private readonly _stack: UndoRecord[] = [];

  public get canUndo(): boolean {
    return this._stack.length > 0;
  }

  public push(record: UndoRecord): void {
    this._stack.push(record);
  }

  public pop(): UndoRecord | null {
    return this._stack.pop() ?? null;
  }

  public clear(): void {
    this._stack.length = 0;
  }
}
