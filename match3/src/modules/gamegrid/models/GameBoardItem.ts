import { GridItem } from "@gamebyte/gamelabsjs";

/**
 * What a gem does beyond matching by colour. A plain gem is `None`; the striped
 * kinds sweep their whole row or column when they are cleared.
 *
 * Deliberately an enum rather than a boolean pair: the 5-match and L/T specials are
 * coming, and they extend this list rather than adding parallel flags.
 */
export enum GemSpecial {
  None = 0,
  StripedRow = 1,
  StripedColumn = 2,
  /**
   * The cookie. Swap it with a gem and every gem of that colour on the board goes;
   * set it off some other way and it picks a colour from what is on screen.
   */
  ColorBomb = 3,
  /**
   * Booster, earned by an L/T match. Its ability is not defined yet — for now it
   * clears like any other gem; only its creation, look and pop order are in place.
   */
  Booster = 4,
  /**
   * Bomb + stripe merged: one item covering a square block of cells. It clears the rows
   * it covers, then the columns, then goes. Only ever made by that swap — no match
   * produces one.
   */
  GiantStripe = 5
}

/**
 * Per-board item model for Match-3: unique `itemId` (gamegrid) + `gemType` for match/color logic.
 */
export class GameBoardItem extends GridItem {
  public readonly gemType: number;
  /** Colour still drives matching; this only changes what happens when it clears. */
  public readonly special: GemSpecial;

  public constructor(itemId: number, gemType: number, special: GemSpecial = GemSpecial.None) {
    super(itemId);
    this.gemType = gemType;
    this.special = special;
  }
}
