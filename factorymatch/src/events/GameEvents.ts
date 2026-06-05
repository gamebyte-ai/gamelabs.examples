import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import type { GameStatus } from "../models/IGameModel.js";

/**
 * Cross-controller bus: the pile (World) controller emits HUD-relevant changes;
 * the screen (HUD) controller subscribes. The 3D slot animation is driven by the
 * pile controller directly on its World view, not through this bus.
 */
export class GameEvents {
  private readonly _scoreChanged = new Set<(score: number) => void>();
  private readonly _statusChanged = new Set<(status: GameStatus) => void>();

  public onScoreChanged(cb: (score: number) => void): Unsubscribe {
    this._scoreChanged.add(cb);
    return () => this._scoreChanged.delete(cb);
  }
  public emitScoreChanged(score: number): void {
    for (const cb of this._scoreChanged) cb(score);
  }

  public onStatusChanged(cb: (status: GameStatus) => void): Unsubscribe {
    this._statusChanged.add(cb);
    return () => this._statusChanged.delete(cb);
  }
  public emitStatusChanged(status: GameStatus): void {
    for (const cb of this._statusChanged) cb(status);
  }
}
