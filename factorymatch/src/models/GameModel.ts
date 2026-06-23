import type { GameStatus, IGameModel, LoseReason } from "./IGameModel.js";

/** Mutable game state. Only `FactoryOperations` mutates it; the HUD controller reads `IGameModel`. */
export class GameModel implements IGameModel {
  private _score = 0;
  private _status: GameStatus = "playing";
  private _lostReason: LoseReason | null = null;
  private _started = false;

  public get score(): number {
    return this._score;
  }

  public get status(): GameStatus {
    return this._status;
  }

  public get lostReason(): LoseReason | null {
    return this._lostReason;
  }

  public get started(): boolean {
    return this._started;
  }

  /** Begin play once the intro countdown finishes. */
  public setStarted(value: boolean): void {
    this._started = value;
  }

  public setScore(value: number): void {
    this._score = value;
  }

  public setStatus(status: GameStatus): void {
    this._status = status;
  }

  /** Mark the game lost, recording why (drives the end banner). */
  public setLost(reason: LoseReason): void {
    this._status = "lost";
    this._lostReason = reason;
  }

  public reset(): void {
    this._score = 0;
    this._status = "playing";
    this._lostReason = null;
    this._started = false;
  }
}
