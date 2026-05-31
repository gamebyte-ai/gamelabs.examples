import type { IBoardModel } from "../models/IBoardModel";

const FOUNDATION_COMPLETE_SIZE = 13;

/**
 * Win-condition predicate for Klondike. Returns true when every
 * foundation pile holds 13 cards. The per-pile `canPlace` chain
 * already enforces A→K-of-one-suit ordering, so card count alone
 * is sufficient to certify a completed foundation; this avoids
 * re-walking each suit to check rank ordering.
 */
export class WinRules {
  public static isWon(board: IBoardModel): boolean {
    return board.foundations.every((f) => f.cards.length === FOUNDATION_COMPLETE_SIZE);
  }
}
