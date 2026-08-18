import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/** Tiny gameplay event bus shared across views/controllers (bound in DI). */
export class GameEvents {
  private readonly _gameOver = new Set<() => void>();

  /** Subscribe to the game-over signal (timer ran out). */
  public onGameOver(cb: () => void): Unsubscribe {
    this._gameOver.add(cb);
    return () => this._gameOver.delete(cb);
  }

  /** Fire the game-over signal. */
  public emitGameOver(): void {
    for (const cb of this._gameOver) cb();
  }
}
