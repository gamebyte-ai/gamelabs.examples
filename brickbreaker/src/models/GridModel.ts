/**
 * The brick grid's logical state: a `cols × rows` grid of cells (row 0 = bottom).
 * A cell is currently just filled/empty; level-based block data (hits, type,
 * colour) lands here as the game is built out. Rendering reads this; the descend
 * step shifts every row down one.
 */
export class GridModel {
  public readonly cols: number;
  public readonly rows: number;
  /** `cells[row][col]` — true = a block is present. */
  public readonly cells: boolean[][];

  public constructor(cols: number, rows: number, fillFromRow = 0) {
    this.cols = Math.max(1, Math.floor(cols));
    this.rows = Math.max(1, Math.floor(rows));
    // Fill rows from `fillFromRow` UP (row 0 = bottom); rows below start empty.
    const from = Math.max(0, Math.floor(fillFromRow));
    this.cells = Array.from({ length: this.rows }, (_, r) => new Array<boolean>(this.cols).fill(r >= from));
  }

  /** Shift every row DOWN one step: row r takes row r+1's content; the bottom row
   * falls out, the top row becomes empty. */
  public descend(): void {
    for (let r = 0; r < this.rows - 1; r++) this.cells[r] = this.cells[r + 1];
    this.cells[this.rows - 1] = new Array<boolean>(this.cols).fill(false);
  }
}
