import { SlotType } from "../constants/SlotType";
import { Rank } from "../constants/Rank";
import { Pile } from "./Pile";
import { FLUSH_STACK } from "../constants/StackingOffset";
import type { ICard } from "./Card";

export class FoundationPile extends Pile {
  public constructor(worldX: number, worldZ: number) {
    super(SlotType.Foundation, worldX, worldZ, FLUSH_STACK);
  }

  public canPlace(cards: readonly ICard[]): boolean {
    if (cards.length !== 1) return false;
    const card = cards[0];
    if (this._cards.length === 0) return card.rank === Rank.Ace;
    const top = this._cards[this._cards.length - 1];
    return card.suit === top.suit && card.rank === top.rank + 1;
  }

  public canDragFrom(index: number): boolean {
    if (index !== this._cards.length - 1) return false;
    return this._cards[index]?.faceUp === true;
  }
}
