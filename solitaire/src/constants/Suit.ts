export enum Suit {
  Clubs = "Clubs",
  Diamonds = "Diamonds",
  Hearts = "Hearts",
  Spades = "Spades",
}

export const SUIT_SYMBOL: Readonly<Record<Suit, string>> = {
  [Suit.Clubs]: "♣",
  [Suit.Diamonds]: "♦",
  [Suit.Hearts]: "♥",
  [Suit.Spades]: "♠",
};
