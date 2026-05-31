import type { IGameModel } from "./IGameModel.js";

export class GameModel implements IGameModel {
  private _score = 0;

  public get score(): number {
    return this._score;
  }

  public addScore(delta: number): void {
    this._score += delta;
  }

  public resetScore(): void {
    this._score = 0;
  }
}
