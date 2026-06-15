import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * State + transition rules for the combo streak.
 *
 * `level` is the running streak count (0 = inactive; 1+ = the
 * current combo multiplier minus one — the HUD shows "COMBO READY"
 * at 1 and "COMBO Xn" at 2+). `movesRemaining` is how many more
 * placements without a line clear the streak can survive before
 * deactivating; capped at `maxMoves` (passed in at construction so
 * it tracks {@link BlockPuzzleConfig.combo.maxMoves}).
 *
 * Transitions, evaluated once per placement via
 * {@link registerPlacement}:
 *
 * - Placement cleared at least one line → `level += 1`,
 *   `movesRemaining = maxMoves`. (Activates a fresh combo at
 *   `level = 1` when previously inactive; bumps an active combo.)
 * - Placement cleared nothing AND combo active → `movesRemaining
 *   -= 1`. If it hits 0, fully deactivates (`level = 0`).
 * - Placement cleared nothing AND combo inactive → no change.
 *
 * Emits a single `onChange` notification per state-changing
 * placement; idempotent transitions (e.g. inactive + no clear)
 * don't fire.
 */
export class ComboModel {
  private readonly _maxMoves: number;
  private _level = 0;
  private _movesRemaining = 0;
  private readonly _listeners = new Set<(model: ComboModel) => void>();

  public constructor(maxMoves: number) {
    this._maxMoves = maxMoves;
  }

  public get level(): number {
    return this._level;
  }

  public get movesRemaining(): number {
    return this._movesRemaining;
  }

  public get maxMoves(): number {
    return this._maxMoves;
  }

  /** Apply the per-placement transition. `linesCleared` = true iff
   *  the placement triggered any line clear (one or more rows /
   *  columns). The model doesn't care about the count beyond that
   *  — single-line and multi-line clears both reset
   *  `movesRemaining` and bump `level` by 1. */
  public registerPlacement(linesCleared: boolean): void {
    const prevLevel = this._level;
    const prevMoves = this._movesRemaining;

    if (linesCleared) {
      this._level += 1;
      this._movesRemaining = this._maxMoves;
    } else if (this._level > 0) {
      this._movesRemaining -= 1;
      if (this._movesRemaining <= 0) {
        this._movesRemaining = 0;
        this._level = 0;
      }
    }

    if (this._level !== prevLevel || this._movesRemaining !== prevMoves) {
      this.notify();
    }
  }

  public reset(): void {
    if (this._level === 0 && this._movesRemaining === 0) return;
    this._level = 0;
    this._movesRemaining = 0;
    this.notify();
  }

  public onChange(callback: (model: ComboModel) => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) cb(this);
  }
}
