import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Cross-view dispatch channel for game-settings changes initiated
 * from the HUD. The Turn 1 / Turn 3 radio group fires
 * `requestModeChange(drawCount)`; {@link SolitaireApp} subscribes and
 * performs a full level restart with the new draw count. Decouples
 * the screen-side trigger from the app-side handler without either
 * side knowing about the other.
 */
export class GameSettingsEvents {
  private readonly _modeListeners = new Set<(drawCount: number) => void>();

  public requestModeChange(drawCount: number): void {
    for (const cb of this._modeListeners) cb(drawCount);
  }

  public onModeChangeRequested(callback: (drawCount: number) => void): Unsubscribe {
    this._modeListeners.add(callback);
    return () => {
      this._modeListeners.delete(callback);
    };
  }
}
