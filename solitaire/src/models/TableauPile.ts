import { SlotType } from "../constants/SlotType";
import { Rank } from "../constants/Rank";
import { Pile } from "./Pile";
import { TABLEAU_STACK } from "../constants/StackingOffset";
import { SuitRules } from "../utilities/SuitRules";
import type { ICard } from "./Card";

export class TableauPile extends Pile {
  public constructor(worldX: number, worldZ: number) {
    super(SlotType.Tableau, worldX, worldZ, TABLEAU_STACK);
  }

  public canPlace(cards: readonly ICard[]): boolean {
    if (cards.length === 0) return false;
    const bottom = cards[0];
    if (this._cards.length === 0) {
      return bottom.rank === Rank.King;
    }
    const top = this._cards[this._cards.length - 1];
    if (!top.faceUp) return false;
    if (bottom.rank !== top.rank - 1) return false;
    return SuitRules.isRed(bottom.suit) !== SuitRules.isRed(top.suit);
  }

  public canDragFrom(index: number): boolean {
    if (index < 0 || index >= this._cards.length) return false;
    return this._cards[index].faceUp;
  }

  public override needsAutoFlipNewTop(): boolean {
    const top = this.topCard;
    return top !== null && !top.faceUp;
  }
}
