import { Suit } from "../constants/Suit";

export class SuitRules {
  public static isRed(suit: Suit): boolean {
    return suit === Suit.Diamonds || suit === Suit.Hearts;
  }

  public static isBlack(suit: Suit): boolean {
    return suit === Suit.Clubs || suit === Suit.Spades;
  }
}
