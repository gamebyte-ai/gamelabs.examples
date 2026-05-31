import type { BoardModel } from "../models/BoardModel";
import type { Card } from "../models/Card";
import type { IRng } from "./IRng";
import { DeckOperations } from "./DeckOperations";
import { ShuffleOperations } from "./ShuffleOperations";

/**
 * Klondike deal. Mutates the supplied board to the final dealt state:
 *   - Tableau columns 1..7 get 1..7 cards (column index i gets i+1).
 *   - Only the top card of each tableau column is face-up.
 *   - Remaining 24 cards go to the stock pile, all face-down.
 *   - Waste and foundations start empty.
 *
 * Returns the ordered list of card ids that should animate from the
 * stock to the tableau when the BoardView plays the deal animation —
 * standard Klondike order: round R places one card into each
 * tableau column from R to 6 (so column C ends up with C+1 cards).
 */
export class DealOperations {
  public static deal(board: BoardModel, rng: IRng): readonly number[] {
    const deck = DeckOperations.createStandardDeck();
    ShuffleOperations.shuffleInPlace(deck, rng);

    const orderedCardIds: number[] = [];
    const tableauColumnCount = board.tableau.length;
    for (let round = 0; round < tableauColumnCount; round++) {
      for (let col = round; col < tableauColumnCount; col++) {
        const card = DealOperations.takeNext(deck);
        card.setFaceUp(false);
        board.tableau[col].pushCard(card);
        orderedCardIds.push(card.id);
      }
    }

    for (const tab of board.tableau) {
      tab.topCard?.setFaceUp(true);
    }

    while (deck.length > 0) {
      const card = DealOperations.takeNext(deck);
      card.setFaceUp(false);
      board.stock.pushCard(card);
    }

    return orderedCardIds;
  }

  private static takeNext(deck: Card[]): Card {
    const card = deck.shift();
    if (!card) throw new Error("DealOperations: deck exhausted mid-deal");
    return card;
  }
}
