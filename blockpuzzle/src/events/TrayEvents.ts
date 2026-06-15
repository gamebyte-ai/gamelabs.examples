import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Cross-controller signal for tray-lifecycle requests the HUD
 * controller can't satisfy on its own.
 *
 * Today there's a single channel: Tray Refresh activations. The HUD
 * controller fires {@link requestRefresh} after consuming the
 * booster, and the boards controller (which owns the tray view +
 * animation pipeline) orchestrates the exit slide → model clear →
 * deal new hand → entry slide.
 *
 * Standard `Set<cb>` + `Unsubscribe` event shape (per AGENTS.md).
 */
export class TrayEvents {
  private readonly _refreshRequestedListeners = new Set<() => void>();

  public requestRefresh(): void {
    for (const cb of this._refreshRequestedListeners) cb();
  }

  public onRefreshRequested(callback: () => void): Unsubscribe {
    this._refreshRequestedListeners.add(callback);
    return () => {
      this._refreshRequestedListeners.delete(callback);
    };
  }
}
