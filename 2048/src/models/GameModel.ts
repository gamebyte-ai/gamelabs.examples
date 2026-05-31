import type { IGameModel } from "./IGameModel.js";

export class GameModel implements IGameModel {
  private _score = 0;
  private _best = 0;
  private _highestValue = 0;

  public get score(): number {
    return this._score;
  }

  public get best(): number {
    return this._best;
  }

  public get highestValue(): number {
    return this._highestValue;
  }

  public setScore(score: number): void {
    this._score = score;
  }

  public setBest(best: number): void {
    this._best = Math.max(0, best);
  }

  public addScore(delta: number): void {
    this._score += delta;
    if (this._score > this._best) this._best = this._score;
  }

  public setHighestValue(value: number): void {
    if (value > this._highestValue) this._highestValue = value;
  }

  public reset(): void {
    this._score = 0;
    this._highestValue = 0;
  }
}
