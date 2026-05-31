import type { Unsubscribe } from "@gamebyte/gamelabsjs";

export class GameEvents {
  private readonly _scoreChangedListeners = new Set<(score: number) => void>();
  private readonly _bestChangedListeners = new Set<(best: number) => void>();
  private readonly _gameOverListeners = new Set<() => void>();
  private readonly _restartTappedListeners = new Set<() => void>();
  private readonly _sfxListeners = new Set<(sfxId: string) => void>();

  public onScoreChanged(cb: (score: number) => void): Unsubscribe {
    this._scoreChangedListeners.add(cb);
    return () => this._scoreChangedListeners.delete(cb);
  }

  public emitScoreChanged(score: number): void {
    for (const cb of this._scoreChangedListeners) cb(score);
  }

  public onBestChanged(cb: (best: number) => void): Unsubscribe {
    this._bestChangedListeners.add(cb);
    return () => this._bestChangedListeners.delete(cb);
  }

  public emitBestChanged(best: number): void {
    for (const cb of this._bestChangedListeners) cb(best);
  }

  public onGameOver(cb: () => void): Unsubscribe {
    this._gameOverListeners.add(cb);
    return () => this._gameOverListeners.delete(cb);
  }

  public emitGameOver(): void {
    for (const cb of this._gameOverListeners) cb();
  }

  public onRestartTapped(cb: () => void): Unsubscribe {
    this._restartTappedListeners.add(cb);
    return () => this._restartTappedListeners.delete(cb);
  }

  public emitRestartTapped(): void {
    for (const cb of this._restartTappedListeners) cb();
  }

  public onPlaySfx(cb: (sfxId: string) => void): Unsubscribe {
    this._sfxListeners.add(cb);
    return () => this._sfxListeners.delete(cb);
  }

  public emitPlaySfx(sfxId: string): void {
    for (const cb of this._sfxListeners) cb(sfxId);
  }
}
