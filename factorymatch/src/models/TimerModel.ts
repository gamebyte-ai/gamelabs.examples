import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Elapsed-time accumulator, advanced once per frame by FactoryOperations while
 * the game is playing. The countdown direction + start value live in
 * FactoryMatchConfig.time and are applied by TimeFormatter when the HUD renders.
 * Emits on every non-zero tick; the HUD dedupes redundant whole-second redraws.
 */
export class TimerModel {
  private _elapsedSeconds = 0;
  private readonly _listeners = new Set<(elapsed: number) => void>();

  public get elapsedSeconds(): number {
    return this._elapsedSeconds;
  }

  public tick(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    this._elapsedSeconds += deltaSeconds;
    this._notify();
  }

  public reset(): void {
    if (this._elapsedSeconds === 0) return;
    this._elapsedSeconds = 0;
    this._notify();
  }

  public onChange(callback: (elapsed: number) => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  private _notify(): void {
    for (const cb of this._listeners) cb(this._elapsedSeconds);
  }
}
