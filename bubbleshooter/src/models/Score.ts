import type { IScore } from "./IScore";

export class Score implements IScore {
  private _value = 0;

  public get value(): number {
    return this._value;
  }

  public add(points: number): void {
    this._value += points;
  }

  public reset(): void {
    this._value = 0;
  }
}
