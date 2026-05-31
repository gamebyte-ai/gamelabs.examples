import type { Unsubscribe } from "@gamebyte/gamelabsjs";

export class GameEvents {
  private readonly _winListeners = new Set<(level: number, moves: number) => void>();
  private readonly _restartListeners = new Set<() => void>();
  private readonly _nextLevelListeners = new Set<() => void>();

  onWin(cb: (level: number, moves: number) => void): Unsubscribe {
    this._winListeners.add(cb);
    return () => this._winListeners.delete(cb);
  }

  emitWin(level: number, moves: number): void {
    for (const cb of this._winListeners) cb(level, moves);
  }

  onRestart(cb: () => void): Unsubscribe {
    this._restartListeners.add(cb);
    return () => this._restartListeners.delete(cb);
  }

  emitRestart(): void {
    for (const cb of this._restartListeners) cb();
  }

  onNextLevel(cb: () => void): Unsubscribe {
    this._nextLevelListeners.add(cb);
    return () => this._nextLevelListeners.delete(cb);
  }

  emitNextLevel(): void {
    for (const cb of this._nextLevelListeners) cb();
  }
}
