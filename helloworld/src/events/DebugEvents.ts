import type { Unsubscribe } from "@gamebyte/gamelabsjs";

export class DebugEvents {
  private readonly _toggleDebugPanelListeners = new Set<() => void>();

  public onToggleDebugPanel(cb: () => void): Unsubscribe {
    this._toggleDebugPanelListeners.add(cb);
    return () => {
      this._toggleDebugPanelListeners.delete(cb);
    };
  }

  public emitToggleDebugPanel(): void {
    for (const cb of this._toggleDebugPanelListeners) cb();
  }
}

