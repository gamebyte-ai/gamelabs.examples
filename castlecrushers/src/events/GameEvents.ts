import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import type { GameStatus } from "../models/IGameModel.js";

/**
 * Cross-controller bus. The game-world controller drives gameplay and emits
 * HUD-relevant changes; the screen (HUD) controller subscribes. This is the
 * communication channel between the World view's controller and the HUD view's
 * controller — it does NOT carry the body↔view pairing (the stage owns that).
 */
export class GameEvents {
  private readonly _ammoChanged = new Set<(ammoLeft: number) => void>();
  private readonly _statusChanged = new Set<(status: GameStatus) => void>();

  public onAmmoChanged(cb: (ammoLeft: number) => void): Unsubscribe {
    this._ammoChanged.add(cb);
    return () => this._ammoChanged.delete(cb);
  }
  public emitAmmoChanged(ammoLeft: number): void {
    for (const cb of this._ammoChanged) cb(ammoLeft);
  }

  public onStatusChanged(cb: (status: GameStatus) => void): Unsubscribe {
    this._statusChanged.add(cb);
    return () => this._statusChanged.delete(cb);
  }
  public emitStatusChanged(status: GameStatus): void {
    for (const cb of this._statusChanged) cb(status);
  }
}
