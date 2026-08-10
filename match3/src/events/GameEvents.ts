import type { Unsubscribe } from "@gamebyte/gamelabsjs";

export class GameEvents {
  private readonly _scoreChangedListeners = new Set<(score: number) => void>();
  private readonly _sfxListeners = new Set<(sfxId: string, rate: number) => void>();

  public onScoreChanged(cb: (score: number) => void): Unsubscribe {
    this._scoreChangedListeners.add(cb);
    return () => this._scoreChangedListeners.delete(cb);
  }

  public emitScoreChanged(score: number): void {
    for (const cb of this._scoreChangedListeners) cb(score);
  }

  private readonly _goalListeners = new Set<(cleared: number, goal: number) => void>();

  /** Progress toward the level's clear goal. */
  public onGoalChanged(cb: (cleared: number, goal: number) => void): Unsubscribe {
    this._goalListeners.add(cb);
    return () => this._goalListeners.delete(cb);
  }

  public emitGoalChanged(cleared: number, goal: number): void {
    for (const cb of this._goalListeners) cb(cleared, goal);
  }

  public onPlaySfx(cb: (sfxId: string, rate: number) => void): Unsubscribe {
    this._sfxListeners.add(cb);
    return () => this._sfxListeners.delete(cb);
  }

  /**
   * `rate` is the playback rate, which shifts pitch along with speed — the board
   * uses it to step the pop upward through a cascade. Defaults to 1 so callers that
   * do not care about pitch stay unchanged.
   */
  public emitPlaySfx(sfxId: string, rate = 1): void {
    for (const cb of this._sfxListeners) cb(sfxId, rate);
  }
}
