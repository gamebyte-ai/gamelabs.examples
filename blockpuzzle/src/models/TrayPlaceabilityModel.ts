import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * "Is there at least one tray piece that could be placed on the
 * current grid?" — exposed as a single boolean so the HUD doesn't
 * need to know about per-slot placeability maps (those live on the
 * world view via `setTrayPlaceability`).
 *
 * Single writer: the boards controller's tray-state recompute. Read
 * by the HUD controller to choose the ready-state booster label
 * ("CHOOSE ONE!" vs. "NO MOVES LEFT, USE BOOSTER!"). The game-over
 * check on the boards controller side reads its own computation,
 * not this model — same source value, two readers.
 *
 * Emits `onChange` only when the boolean actually flips.
 */
export class TrayPlaceabilityModel {
  private _hasPlaceable = false;
  private readonly _listeners = new Set<(model: TrayPlaceabilityModel) => void>();

  public get hasPlaceable(): boolean {
    return this._hasPlaceable;
  }

  public setHasPlaceable(value: boolean): void {
    if (this._hasPlaceable === value) return;
    this._hasPlaceable = value;
    this.notify();
  }

  public onChange(callback: (model: TrayPlaceabilityModel) => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) cb(this);
  }
}
