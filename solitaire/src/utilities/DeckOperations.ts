import { Card } from "../models/Card";
import { Suit } from "../constants/Suit";
import { ALL_RANKS } from "../constants/Rank";

export class DeckOperations {
  public static createStandardDeck(): Card[] {
    const suits: Suit[] = [Suit.Clubs, Suit.Diamonds, Suit.Hearts, Suit.Spades];
    const deck: Card[] = [];
    let id = 0;
    for (const suit of suits) {
      for (const rank of ALL_RANKS) {
        deck.push(new Card(id++, suit, rank, false));
      }
    }
    return deck;
  }
}
