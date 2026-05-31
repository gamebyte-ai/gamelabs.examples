import { Bottle } from "./Bottle.js";
import type { IGameModel } from "./IGameModel.js";

/**
 * Holds game state: bottles, current level, and move count.
 * Read access through {@link IGameModel}. Mutations go through
 * {@link WaterSortOperations}.
 */
export class GameModel implements IGameModel {
  private _bottles: Bottle[] = [];
  private _level = 0;
  private _moves = 0;

  public get bottles(): readonly Bottle[] {
    return this._bottles;
  }

  public get level(): number {
    return this._level;
  }

  public get moves(): number {
    return this._moves;
  }

  public setBottles(bottles: Bottle[]): void {
    this._bottles = bottles;
  }

  public setLevel(level: number): void {
    this._level = level;
  }

  public setMoves(moves: number): void {
    this._moves = moves;
  }

  public incrementMoves(): void {
    this._moves++;
  }
}
