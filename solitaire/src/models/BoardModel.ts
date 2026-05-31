import type { IBoardModel } from "./IBoardModel";
import { StockPile } from "./StockPile";
import { WastePile } from "./WastePile";
import { FoundationPile } from "./FoundationPile";
import { TableauPile } from "./TableauPile";

// World-space layout constants for the Klondike board. The two rows are
// the top row (stock + waste + 4 foundations) and the tableau row.
const COLUMN_X: readonly number[] = [-3.45, -2.3, -1.15, 0, 1.15, 2.3, 3.45];
const TOP_ROW_Z = -0.9;
const TABLEAU_ROW_Z = 0.9;

export interface BoardModelOptions {
  /** Number of cards a stock-to-waste draw transfers; doubles as the
   *  size of the waste pile's visible fan. Set to 1 for Turn-1 mode. */
  readonly drawCount: number;
  /** Per-card horizontal offset within the waste pile's fan (world
   *  units). Ignored when drawCount <= 1. */
  readonly wasteFanX: number;
}

export class BoardModel implements IBoardModel {
  public readonly stock: StockPile;
  public readonly waste: WastePile;
  public readonly foundations: readonly [FoundationPile, FoundationPile, FoundationPile, FoundationPile];
  public readonly tableau: readonly [TableauPile, TableauPile, TableauPile, TableauPile, TableauPile, TableauPile, TableauPile];
  public readonly allPiles: readonly (StockPile | WastePile | FoundationPile | TableauPile)[];

  public constructor(options: BoardModelOptions) {
    this.stock = new StockPile(COLUMN_X[0], TOP_ROW_Z);
    this.waste = new WastePile(COLUMN_X[1], TOP_ROW_Z, options.drawCount, options.wasteFanX);
    this.foundations = [
      new FoundationPile(COLUMN_X[3], TOP_ROW_Z),
      new FoundationPile(COLUMN_X[4], TOP_ROW_Z),
      new FoundationPile(COLUMN_X[5], TOP_ROW_Z),
      new FoundationPile(COLUMN_X[6], TOP_ROW_Z),
    ];
    this.tableau = [
      new TableauPile(COLUMN_X[0], TABLEAU_ROW_Z),
      new TableauPile(COLUMN_X[1], TABLEAU_ROW_Z),
      new TableauPile(COLUMN_X[2], TABLEAU_ROW_Z),
      new TableauPile(COLUMN_X[3], TABLEAU_ROW_Z),
      new TableauPile(COLUMN_X[4], TABLEAU_ROW_Z),
      new TableauPile(COLUMN_X[5], TABLEAU_ROW_Z),
      new TableauPile(COLUMN_X[6], TABLEAU_ROW_Z),
    ];
    this.allPiles = [this.stock, this.waste, ...this.foundations, ...this.tableau];
  }
}
