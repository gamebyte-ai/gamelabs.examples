import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Cross-view dispatch channel for "undo requested". The HUD's undo
 * button fires `request()` (via the GameScreen controller); the
 * BoardViewController subscribes via `onRequested` and performs the
 * actual undo against the model + view. Decouples the screen-side
 * trigger from the world-side handler without either side knowing
 * about the other.
 */
export class UndoEvents {
  private readonly _listeners = new Set<() => void>();

  public request(): void {
    for (const cb of this._listeners) cb();
  }

  public onRequested(callback: () => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }
}
