import type { Suit } from "../constants/Suit";
import type { Rank } from "../constants/Rank";

export interface ICard {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: Rank;
  readonly faceUp: boolean;
}

export class Card implements ICard {
  public readonly id: number;
  public readonly suit: Suit;
  public readonly rank: Rank;
  private _faceUp: boolean;

  public constructor(id: number, suit: Suit, rank: Rank, faceUp: boolean = false) {
    this.id = id;
    this.suit = suit;
    this.rank = rank;
    this._faceUp = faceUp;
  }

  public get faceUp(): boolean {
    return this._faceUp;
  }

  public setFaceUp(faceUp: boolean): void {
    this._faceUp = faceUp;
  }

  public flip(): void {
    this._faceUp = !this._faceUp;
  }
}
