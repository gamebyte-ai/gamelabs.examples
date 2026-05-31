import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Cross-controller signals for the Color Block Jam level.
 *
 * - `onBlockCleared` — a block has just exited through its matching door.
 * - `onWin` — every block has been cleared. The HUD opens the win popup.
 * - `onAdvanceLevel` — the player confirmed "Next Level" on the win
 *   popup. The board controller listens and rebuilds the level.
 * - `onLevelChanged` — a new level has just been loaded into the world.
 *   The HUD updates its header text.
 */
export class GameEvents {
  private readonly _blockCleared = new Set<(blockId: number, doorId: number) => void>();
  private readonly _win = new Set<() => void>();
  private readonly _advanceLevel = new Set<() => void>();
  private readonly _levelChanged = new Set<(index: number) => void>();

  public onBlockCleared(cb: (blockId: number, doorId: number) => void): Unsubscribe {
    this._blockCleared.add(cb);
    return () => this._blockCleared.delete(cb);
  }

  public emitBlockCleared(blockId: number, doorId: number): void {
    for (const cb of this._blockCleared) cb(blockId, doorId);
  }

  public onWin(cb: () => void): Unsubscribe {
    this._win.add(cb);
    return () => this._win.delete(cb);
  }

  public emitWin(): void {
    for (const cb of this._win) cb();
  }

  public onAdvanceLevel(cb: () => void): Unsubscribe {
    this._advanceLevel.add(cb);
    return () => this._advanceLevel.delete(cb);
  }

  public emitAdvanceLevel(): void {
    for (const cb of this._advanceLevel) cb();
  }

  public onLevelChanged(cb: (index: number) => void): Unsubscribe {
    this._levelChanged.add(cb);
    return () => this._levelChanged.delete(cb);
  }

  public emitLevelChanged(index: number): void {
    for (const cb of this._levelChanged) cb(index);
  }
}
