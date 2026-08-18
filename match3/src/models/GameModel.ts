import type { IGameModel } from "./IGameModel.js";

export class GameModel implements IGameModel {
  private _score = 0;
  private _cleared = 0;

  public get score(): number {
    return this._score;
  }

  /** Gems cleared this level — the level goal counts these, not score. */
  public get cleared(): number {
    return this._cleared;
  }

  public addScore(delta: number): void {
    this._score += delta;
  }

  public addCleared(count: number): void {
    this._cleared += count;
  }

  public resetScore(): void {
    this._score = 0;
    this._cleared = 0;
  }
}
