import type { Card } from "../models/Card";
import type { IPile } from "../models/IPile";
import { Pile } from "../models/Pile";

/**
 * Klondike stock/waste flow. Draws cards from the top of stock to waste
 * (face-up, packet-flip semantic — the original stock top lands as
 * the new waste top) and recycles waste back into stock (face-down)
 * when stock is empty. Recycle reverses the waste order so an
 * unbroken cycle restores the original stock order.
 */
export class StockOperations {
  /** Number of cards a single stock-tap moves to the waste, capped by
   *  the current stock length. */
  public static resolveDrawCount(stock: IPile, requested: number): number {
    return Math.min(stock.cards.length, requested);
  }

  public static drawToWaste(stock: IPile, waste: IPile, count: number): void {
    const stockPile = stock as Pile;
    const wastePile = waste as Pile;
    // Pop the packet first, then push to waste in reverse order so
    // the card that was on top of stock ends up on top of waste —
    // the player sees the visible top of stock animate to the visible
    // (draggable) top of waste, rather than to the bottom of the new
    // fan batch.
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      const card = stockPile.popCard();
      if (!card) break;
      card.setFaceUp(true);
      drawn.push(card);
    }
    for (let i = drawn.length - 1; i >= 0; i--) {
      wastePile.pushCard(drawn[i]);
    }
  }

  /**
   * Snapshot — read-only — of the card ids the next `count` stock
   * draws will move to the waste, in pop order (current top first).
   * That order matches how {@link drawToWaste} pushes them, so
   * `result[i]` lands at the i-th fan slot (leftmost-first in Turn 3).
   * Caller is responsible for capping `count` against stock length
   * (see {@link resolveDrawCount}).
   */
  public static peekDrawableCardIds(stock: IPile, count: number): readonly number[] {
    const stockLength = stock.cards.length;
    const capped = Math.min(stockLength, count);
    const ids: number[] = [];
    for (let i = 0; i < capped; i++) {
      ids.push(stock.cards[stockLength - 1 - i].id);
    }
    return ids;
  }

  /**
   * Snapshot — read-only — of every waste card id, in waste-stack
   * order (bottom first). Captured before {@link recycleWasteToStock}
   * empties the waste; the recycle animation tweens these cardObjects
   * from their current waste positions back to the stock.
   */
  public static peekRecyclableCardIds(waste: IPile): readonly number[] {
    const ids: number[] = [];
    for (const card of waste.cards) ids.push(card.id);
    return ids;
  }

  public static recycleWasteToStock(stock: IPile, waste: IPile): void {
    const stockPile = stock as Pile;
    const wastePile = waste as Pile;
    while (true) {
      const card = wastePile.popCard();
      if (!card) return;
      card.setFaceUp(false);
      stockPile.pushCard(card);
    }
  }
}
