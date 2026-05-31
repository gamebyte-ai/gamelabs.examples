import type { IBoardModel } from "../models/IBoardModel";
import { Card } from "../models/Card";
import { Pile } from "../models/Pile";
import type { UndoRecord } from "../models/UndoRecord";
import { CardMoveOperations } from "./CardMoveOperations";

/**
 * Reverses a single {@link UndoRecord} against the board model. Pure
 * model mutation — the caller is responsible for driving any view
 * animation in response. Bypasses the standard placement rules
 * (foundations, tableaux) since undo can legitimately push cards
 * back into positions that wouldn't be reachable forward.
 *
 * Waste fan layout is derived purely from the current waste length,
 * so no anchor restoration is needed — popping cards back to stock
 * (or pushing them back to waste) automatically realigns the fan.
 */
export class UndoOperations {
  public static undo(board: IBoardModel, record: UndoRecord): void {
    switch (record.kind) {
      case "move":
        UndoOperations.undoMove(board, record);
        return;
      case "draw":
        UndoOperations.undoDraw(board, record);
        return;
      case "recycle":
        UndoOperations.undoRecycle(board, record);
        return;
    }
  }

  /**
   * Snapshot of the card ids the upcoming undo animation will move.
   * Must be called BEFORE {@link undo} mutates the board — the
   * cardObjects need to tween from their pre-undo positions, which are
   * derived from the current model.
   *
   * Draw undo → the waste's top `count` cards (returning to stock).
   * Recycle undo → every stock card (returning to waste).
   * Move undo → an empty array; `BoardAnimator.playUndoMove` walks the
   * post-mutation model itself.
   */
  public static captureUndoAnimationCardIds(board: IBoardModel, record: UndoRecord): readonly number[] {
    if (record.kind === "draw") {
      const waste = board.waste.cards;
      const start = waste.length - record.count;
      const ids: number[] = [];
      for (let i = start; i < waste.length; i++) ids.push(waste[i].id);
      return ids;
    }
    if (record.kind === "recycle") {
      const stock = board.stock.cards;
      const ids: number[] = [];
      for (const card of stock) ids.push(card.id);
      return ids;
    }
    return [];
  }

  private static undoMove(board: IBoardModel, record: Extract<UndoRecord, { kind: "move" }>): void {
    if (record.autoFlippedCardId !== null) {
      const card = UndoOperations.findCardById(board, record.autoFlippedCardId);
      card?.setFaceUp(false);
    }
    const fromIndex = record.target.cards.length - record.count;
    CardMoveOperations.moveCards(record.target, fromIndex, record.origin);
  }

  private static undoDraw(board: IBoardModel, record: Extract<UndoRecord, { kind: "draw" }>): void {
    const stockPile = board.stock as Pile;
    const wastePile = board.waste as Pile;
    // Mirrors `StockOperations.drawToWaste`'s reverse-push: pop the
    // drawn cards off the waste, then push them back to stock in
    // reverse order so the pre-draw stock order is exactly restored.
    const buffer: Card[] = [];
    for (let i = 0; i < record.count; i++) {
      const card = wastePile.popCard();
      if (!card) break;
      card.setFaceUp(false);
      buffer.push(card);
    }
    for (let i = buffer.length - 1; i >= 0; i--) {
      stockPile.pushCard(buffer[i]);
    }
  }

  private static undoRecycle(board: IBoardModel, record: Extract<UndoRecord, { kind: "recycle" }>): void {
    const stockPile = board.stock as Pile;
    const wastePile = board.waste as Pile;
    for (let i = 0; i < record.count; i++) {
      const card = stockPile.popCard();
      if (!card) break;
      card.setFaceUp(true);
      wastePile.pushCard(card);
    }
  }

  private static findCardById(board: IBoardModel, cardId: number): Card | null {
    for (const pile of board.allPiles) {
      for (const card of pile.cards) {
        if (card.id === cardId) return card as Card;
      }
    }
    return null;
  }
}
