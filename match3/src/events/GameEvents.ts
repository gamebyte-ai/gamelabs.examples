import type { Unsubscribe } from "@gamebyte/gamelabsjs";

export class GameEvents {
  private readonly _scoreChangedListeners = new Set<(score: number) => void>();
  private readonly _sfxListeners = new Set<(sfxId: string) => void>();

  public onScoreChanged(cb: (score: number) => void): Unsubscribe {
    this._scoreChangedListeners.add(cb);
    return () => this._scoreChangedListeners.delete(cb);
  }

  public emitScoreChanged(score: number): void {
    for (const cb of this._scoreChangedListeners) cb(score);
  }

  public onPlaySfx(cb: (sfxId: string) => void): Unsubscribe {
    this._sfxListeners.add(cb);
    return () => this._sfxListeners.delete(cb);
  }

  public emitPlaySfx(sfxId: string): void {
    for (const cb of this._sfxListeners) cb(sfxId);
  }
}
