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
  private readonly _goalChanged = new Set<(index: number, remaining: number) => void>();
  private readonly _started = new Set<() => void>();

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

  public onGoalChanged(cb: (index: number, remaining: number) => void): Unsubscribe {
    this._goalChanged.add(cb);
    return () => this._goalChanged.delete(cb);
  }
  public emitGoalChanged(index: number, remaining: number): void {
    for (const cb of this._goalChanged) cb(index, remaining);
  }

  /** Fired when the intro countdown finishes — play should begin. */
  public onStarted(cb: () => void): Unsubscribe {
    this._started.add(cb);
    return () => this._started.delete(cb);
  }
  public emitStarted(): void {
    for (const cb of this._started) cb();
  }
}
