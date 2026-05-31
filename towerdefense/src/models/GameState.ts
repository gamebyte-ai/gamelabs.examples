import type { IGameState } from "./IGameState.js";

/**
 * Mutable game state: player gold and base HP.
 *
 * Bound under both the concrete `GameState` token (resolved by the
 * `GameOperations` utility for mutations) and the readonly
 * {@link IGameState} token (resolved by controllers for reads).
 */
export class GameState implements IGameState {
  private _gold: number;
  private _baseHp: number;
  private readonly _maxBaseHp: number;
  private _kills = 0;
  private _waveNumber = 1;

  public constructor(gold: number, baseHp: number) {
    this._gold = gold;
    this._baseHp = baseHp;
    this._maxBaseHp = baseHp;
  }

  public get gold(): number {
    return this._gold;
  }

  public get baseHp(): number {
    return this._baseHp;
  }

  public get maxBaseHp(): number {
    return this._maxBaseHp;
  }

  public get kills(): number {
    return this._kills;
  }

  public get waveNumber(): number {
    return this._waveNumber;
  }

  public addGold(amount: number): void {
    this._gold += amount;
  }

  public spendGold(amount: number): boolean {
    if (this._gold < amount) return false;
    this._gold -= amount;
    return true;
  }

  public damageBase(amount: number): void {
    this._baseHp = Math.max(0, this._baseHp - amount);
  }

  public recordKill(): void {
    this._kills += 1;
  }

  public reset(gold: number, baseHp: number): void {
    this._gold = gold;
    this._baseHp = baseHp;
    this._kills = 0;
    this._waveNumber = 1;
  }
}
