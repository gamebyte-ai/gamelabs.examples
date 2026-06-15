import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Monotonic elapsed-time accumulator, advanced once per simulation
 * step by {@link BlockPuzzleApp.onStep} while the game is in the
 * Playing state. Direction (up vs. down) and the initial display
 * value live in {@link BlockPuzzleConfig.time} and are applied by
 * {@link TimeFormatter} when the HUD renders.
 *
 * Emits a change event on every non-zero tick. Consumers that need
 * to throttle (e.g. `mm:ss` displays that only redraw on whole-
 * second boundaries) cache the previously-rendered string and
 * short-circuit redundant updates view-side.
 *
 * Same shape as Solitaire's TimerModel.
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
    this.notify();
  }

  public reset(): void {
    if (this._elapsedSeconds === 0) return;
    this._elapsedSeconds = 0;
    this.notify();
  }

  public onChange(callback: (elapsed: number) => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) cb(this._elapsedSeconds);
  }
}
