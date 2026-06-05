import type { GameStatus, IGameModel } from "./IGameModel.js";

/**
 * Mutable game state. Only `CastleOperations` mutates it; the controller reads
 * it through the readonly `IGameModel` interface to drive the HUD.
 */
export class GameModel implements IGameModel {
  private _ammoLeft = 0;
  private _status: GameStatus = "playing";

  public get ammoLeft(): number {
    return this._ammoLeft;
  }

  public get status(): GameStatus {
    return this._status;
  }

  public setAmmoLeft(value: number): void {
    this._ammoLeft = value;
  }

  public setStatus(status: GameStatus): void {
    this._status = status;
  }

  public reset(): void {
    this._ammoLeft = 0;
    this._status = "playing";
  }
}
