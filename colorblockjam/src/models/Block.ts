import type { CellCoord } from "../constants/BoardTypes.js";
import type { BlockItem } from "./BlockItem.js";

/**
 * A colored block that lives on the grid. `shape` is a fixed, normalized
 * list of offsets (min col = min row = 0) and never changes. `anchor` is
 * the grid cell the shape's origin currently occupies; sliding the block
 * changes the anchor, never the shape.
 *
 * `items` holds one {@link BlockItem} per shape offset, in the same
 * order as `shape`. Operations.buildLevel mints them and places them in
 * grid cells; coordinated moves (anchor changes) keep the shape↔item
 * correspondence intact. Mutations go through `GameOperations`;
 * controllers / views read via the readonly {@link IGameModel} interface.
 */
export class Block {
  public readonly id: number;
  public readonly colorIndex: number;
  public readonly shape: readonly CellCoord[];
  public readonly width: number;
  public readonly height: number;

  private _anchor: CellCoord;
  private _cleared = false;
  private _items: BlockItem[] = [];

  public constructor(id: number, colorIndex: number, shape: readonly CellCoord[], anchor: CellCoord) {
    this.id = id;
    this.colorIndex = colorIndex;
    this.shape = shape;

    let maxCol = 0;
    let maxRow = 0;
    for (const o of shape) {
      if (o.col > maxCol) maxCol = o.col;
      if (o.row > maxRow) maxRow = o.row;
    }
    this.width = maxCol + 1;
    this.height = maxRow + 1;

    this._anchor = anchor;
  }

  public get anchor(): CellCoord {
    return this._anchor;
  }

  public setAnchor(anchor: CellCoord): void {
    this._anchor = anchor;
  }

  public get cleared(): boolean {
    return this._cleared;
  }

  public clear(): void {
    this._cleared = true;
  }

  public get items(): readonly BlockItem[] {
    return this._items;
  }

  /** @internal Set by `GameOperations.buildLevel` once the shape's items are minted. */
  public setItems(items: BlockItem[]): void {
    this._items = items;
  }

  /** Absolute grid cells currently occupied by this block. */
  public absoluteCells(): CellCoord[] {
    return this.absoluteCellsAt(this._anchor);
  }

  /** Absolute grid cells this block would occupy with the given anchor. */
  public absoluteCellsAt(anchor: CellCoord): CellCoord[] {
    const out: CellCoord[] = [];
    for (const offset of this.shape) out.push({ col: anchor.col + offset.col, row: anchor.row + offset.row });
    return out;
  }
}
