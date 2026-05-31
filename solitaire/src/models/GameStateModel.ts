import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import { GameState } from "../constants/GameState";

/**
 * Single-source-of-truth for game lifecycle state. Read by
 * {@link SolitaireApp} to gate timer ticks, by
 * {@link BoardViewController} to gate input, and by
 * {@link GameScreenViewController} to drive the end-state HUD label.
 *
 * Transitions are caller-validated (no enforced state-machine
 * here): App moves Dealing→Playing in the deal-animation callback;
 * the screen controller moves Playing→TimeOver when the configured
 * countdown reaches zero. A separate losing state belongs alongside
 * TimeOver when that mechanic lands.
 */
export class GameStateModel {
  private _state: GameState = GameState.Dealing;
  private readonly _listeners = new Set<(state: GameState) => void>();

  public get state(): GameState {
    return this._state;
  }

  public setState(state: GameState): void {
    if (this._state === state) return;
    this._state = state;
    this.notify();
  }

  public onStateChanged(callback: (state: GameState) => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) cb(this._state);
  }
}
