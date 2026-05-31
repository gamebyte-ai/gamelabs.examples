import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Team } from "../constants/Team.js";

export class TurnEvents {
  private readonly _turnChangedListeners = new Set<(team: Team) => void>();
  private readonly _gameWonListeners = new Set<(winner: Team) => void>();
  private readonly _gameDrawListeners = new Set<() => void>();
  private readonly _gameRestartedListeners = new Set<() => void>();

  public onTurnChanged(cb: (team: Team) => void): Unsubscribe {
    this._turnChangedListeners.add(cb);
    return () => this._turnChangedListeners.delete(cb);
  }

  public emitTurnChanged(team: Team): void {
    for (const cb of this._turnChangedListeners) cb(team);
  }

  public onGameWon(cb: (winner: Team) => void): Unsubscribe {
    this._gameWonListeners.add(cb);
    return () => this._gameWonListeners.delete(cb);
  }

  public emitGameWon(winner: Team): void {
    for (const cb of this._gameWonListeners) cb(winner);
  }

  public onGameDraw(cb: () => void): Unsubscribe {
    this._gameDrawListeners.add(cb);
    return () => this._gameDrawListeners.delete(cb);
  }

  public emitGameDraw(): void {
    for (const cb of this._gameDrawListeners) cb();
  }

  public onGameRestarted(cb: () => void): Unsubscribe {
    this._gameRestartedListeners.add(cb);
    return () => this._gameRestartedListeners.delete(cb);
  }

  public emitGameRestarted(): void {
    for (const cb of this._gameRestartedListeners) cb();
  }
}
