import type { GameStatus, IGameModel } from "./IGameModel.js";

/** Mutable game state. Only `FactoryOperations` mutates it; the HUD controller reads `IGameModel`. */
export class GameModel implements IGameModel {
  private _score = 0;
  private _status: GameStatus = "playing";

  public get score(): number {
    return this._score;
  }

  public get status(): GameStatus {
    return this._status;
  }

  public setScore(value: number): void {
    this._score = value;
  }

  public setStatus(status: GameStatus): void {
    this._status = status;
  }

  public reset(): void {
    this._score = 0;
    this._status = "playing";
  }
}
