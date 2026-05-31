import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Single-valued score state. The {@link BoardViewController} is the
 * sole writer (calls {@link add} after every scoring event and on
 * undo); HUD controllers subscribe via {@link onChange} to push the
 * value into a label without polling.
 */
export class ScoreModel {
  private _value = 0;
  private readonly _listeners = new Set<(value: number) => void>();

  public get value(): number {
    return this._value;
  }

  public add(delta: number): void {
    if (delta === 0) return;
    const next = Math.max(0, this._value + delta);
    if (next === this._value) return;
    this._value = next;
    this.notify();
  }

  public reset(): void {
    if (this._value === 0) return;
    this._value = 0;
    this.notify();
  }

  public onChange(callback: (value: number) => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) cb(this._value);
  }
}
