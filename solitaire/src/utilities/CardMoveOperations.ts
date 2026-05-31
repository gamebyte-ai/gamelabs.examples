import type { Card, ICard } from "../models/Card";
import type { IPile } from "../models/IPile";
import { Pile } from "../models/Pile";

/**
 * Card-stack mutations. `moveCards` transfers the top `(N - fromIndex)`
 * cards of `from` (in original bottom→top order) onto `to`;
 * `flipTopCard` sets the face state of a pile's top card. No rule
 * checks — the controller validates placement via `IPile.canPlace`
 * before calling.
 */
export class CardMoveOperations {
  public static moveCards(from: IPile, fromIndex: number, to: IPile): void {
    if (fromIndex < 0 || fromIndex >= from.cards.length) {
      throw new Error(`CardMoveOperations: fromIndex ${fromIndex} out of range (size ${from.cards.length})`);
    }
    const fromPile = from as Pile;
    const toPile = to as Pile;
    const popped: Card[] = [];
    while (fromPile.cards.length > fromIndex) {
      const card = fromPile.popCard();
      if (!card) break;
      popped.push(card);
    }
    popped.reverse();
    for (const card of popped) toPile.pushCard(card);
  }

  public static flipTopCard(pile: IPile, faceUp: boolean): void {
    const top = (pile as Pile).topCard;
    if (top === null) return;
    top.setFaceUp(faceUp);
  }

  /**
   * First foundation (in iteration order) that accepts `card` on its
   * own. Used by the quick-placement (click-to-route) path; returns
   * null when no foundation will take the card. Pure read — no
   * mutation; the caller mutates via {@link moveCards} once it has a
   * destination.
   */
  public static findFoundationDestination(foundations: readonly IPile[], card: ICard): IPile | null {
    for (const foundation of foundations) {
      if (foundation.canPlace([card])) return foundation;
    }
    return null;
  }
}
