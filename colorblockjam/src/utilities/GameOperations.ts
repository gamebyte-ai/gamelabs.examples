import { GridsModel, RectGrid, RectGridPreset, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { ColorBlockJamConfig } from "../ColorBlockJamConfig.js";
import type { CellCoord, DoorSide } from "../constants/BoardTypes.js";
import type { CommitResult, ExitMatch, FloatPos } from "../constants/DragTypes.js";
import { GameModel } from "../models/GameModel.js";
import { Block } from "../models/Block.js";
import { BlockItem } from "../models/BlockItem.js";
import { Door } from "../models/Door.js";
import { LevelManager } from "./LevelManager.js";

export type { CommitResult, ExitMatch, FloatPos } from "../constants/DragTypes.js";

const BOARD_GRID_ID = 1;

/**
 * Owns every mutation to the game model and all movement rules.
 *
 * Each level constructs a fresh framework `RectGrid` (sized to the level
 * descriptor's `cols × rows`) and places one `BlockItem` per shape cell
 * of every block. All blocks belonging to the same logical block share a
 * `groupId` (= `Block.id`) so collision logic can identify them. The
 * grid is registered with the framework's `GridsModel`; on level end we
 * remove it.
 *
 * Movement model — continuous drag with slide-and-stop collisions:
 * - A block's "anchor" in the model is always an integer cell. During a
 *   drag, the *view* tracks a float position; the controller asks
 *   {@link clampDragStep} each pointer move to figure out where the
 *   block should actually be, given the cursor's target and obstacles.
 * - {@link clampDragStep} applies the requested translation axis-by-axis
 *   (X, then Z), clamping each axis against (a) other un-cleared cells
 *   in the grid (cells whose item belongs to a different `groupId`),
 *   (b) grid bounds, and (c) door passages when — and only when — the
 *   block is aligned with a matching-colour, matching-span door on that
 *   edge.
 * - On release, {@link commitRelease} either marks the block for exit
 *   (if it has been dragged into a cell adjacent to a matching door) or
 *   snaps the model anchor to the nearest legal integer cell. Anchor
 *   changes are *coordinated moves*: items are removed from the old
 *   anchor's cells, the anchor is updated, then items are re-added at
 *   the new anchor.
 *
 * Door match semantics are strict:
 * - A door covers a contiguous span of edge cells with a single colour.
 * - A block can only use a door whose colour matches AND whose span
 *   length equals the block's perpendicular width (exact).
 * - The block's position on that perpendicular axis must align with the
 *   door's `spanStart` after rounding — adjacent doors of different
 *   colours never combine.
 */
export class GameOperations implements IInjectionTarget {
  private _model!: GameModel;
  private _levels!: LevelManager;
  private _config!: ColorBlockJamConfig;
  private _gridsModel!: GridsModel;
  private _grid: RectGrid | null = null;
  private _nextItemId = 1;

  public inject(resolver: IInstanceResolver): void {
    this._model = resolver.getInstance(GameModel);
    this._levels = resolver.getInstance(LevelManager);
    this._config = resolver.getInstance(ColorBlockJamConfig);
    this._gridsModel = resolver.getInstance(GridsModel);
  }

  /** Seeds the current level from the {@link LevelManager}. */
  public buildLevel(): void {
    // Tear down the previous level's grid (if any) — clears all items
    // along with it. Items are GC'd; nothing else references them.
    if (this._grid) {
      this._gridsModel.removeGrid(BOARD_GRID_ID);
      this._grid = null;
    }

    const level = this._levels.current;
    const preset = new RectGridPreset({ columnCount: level.cols, rowCount: level.rows });
    this._grid = new RectGrid(BOARD_GRID_ID, preset);
    this._gridsModel.addGrid(this._grid);

    const blocks: Block[] = [];
    for (const b of level.blocks) {
      const block = new Block(b.id, b.colorIndex, b.shape, b.anchor);
      const items: BlockItem[] = [];
      for (const offset of block.shape) {
        const item = new BlockItem(this._nextItemId++, block.id, block.colorIndex);
        items.push(item);
        this._grid.addCellItem(block.anchor.col + offset.col, block.anchor.row + offset.row, item);
      }
      block.setItems(items);
      blocks.push(block);
    }

    const doors: Door[] = [];
    for (const d of level.doors) {
      doors.push(new Door(d.id, d.side, d.spanStart, d.spanEnd, d.colorIndex));
    }
    this._assertNoOverlappingDoors(doors);
    this._model.setLevel(blocks, doors);
  }

  /**
   * Resolves a requested drag target into a clamped float position.
   *
   * `current` is the block's present float position; `target` is where
   * the cursor wants it to be. The X axis is solved first, then Z. Each
   * axis is clamped against (a) other un-cleared cells in the grid that
   * overlap on the perpendicular axis, (b) the grid bound, with a door
   * pass-through when the block's perpendicular position aligns with a
   * matching door on that side.
   */
  public clampDragStep(blockId: number, current: FloatPos, target: FloatPos): FloatPos | null {
    const block = this._model.getBlockById(blockId);
    if (!block || block.cleared) return null;

    const col = this._clampAxisX(block, current.col, current.row, target.col);
    const row = this._clampAxisZ(block, col, current.row, target.row);
    return { col, row };
  }

  /**
   * Checks whether the currently-dragged block is parked in the cell(s)
   * directly in front of a matching door, within
   * {@link ColorBlockJamConfig.exitAlignTolerance}, AND whose exit path
   * (the cells it would sweep while leaving) is free of obstacles.
   */
  public detectExitTrigger(blockId: number, dragPos: FloatPos): ExitMatch | null {
    const block = this._model.getBlockById(blockId);
    if (!block || block.cleared) return null;
    const tol = this._config.exitAlignTolerance;
    const snapCol = Math.round(dragPos.col);
    const snapRow = Math.round(dragPos.row);
    if (Math.abs(dragPos.col - snapCol) > tol) return null;
    if (Math.abs(dragPos.row - snapRow) > tol) return null;
    const anchor: CellCoord = { col: snapCol, row: snapRow };
    const match = this._findExitAt(block, snapCol, snapRow);
    if (!match) return null;
    if (!this._isExitPathClear(block, anchor, match.side)) return null;
    // Commit the anchor (coordinated move so the items live at the
    // snapped cells before the exit animation reads from them).
    this._moveBlockToAnchor(block, anchor);
    return { doorId: match.doorId, side: match.side, anchor };
  }

  /**
   * Commits the end of a drag. The grid edge is a hard wall during drag,
   * so the block is always in a legal in-grid position. If it snaps into
   * a door-adjacent cell with a matching door AND a clear exit path,
   * returns `exit` (the caller runs the animation then calls
   * {@link clearBlock}). Otherwise returns `rest` with the snapped anchor.
   */
  public commitRelease(blockId: number, finalPos: FloatPos): CommitResult | null {
    const block = this._model.getBlockById(blockId);
    if (!block || block.cleared) return null;

    const anchor = this._snapToLegalAnchor(block, finalPos);
    this._moveBlockToAnchor(block, anchor);

    const adjacent = this._findExitAt(block, anchor.col, anchor.row);
    if (adjacent && this._isExitPathClear(block, anchor, adjacent.side)) {
      return { kind: "exit", doorId: adjacent.doorId, side: adjacent.side, anchor };
    }
    return { kind: "rest", anchor };
  }

  /**
   * Removes the block's items from the grid and marks it as cleared.
   * The controller calls this when the exit animation begins so the
   * vacated cells become available for other blocks while the visual
   * still plays its slide-off.
   */
  public clearBlock(blockId: number): void {
    const block = this._model.getBlockById(blockId);
    if (!block || block.cleared) return;
    const grid = this._requireGrid();
    for (const offset of block.shape) {
      const col = block.anchor.col + offset.col;
      const row = block.anchor.row + offset.row;
      grid.removeCellItem(col, row);
    }
    block.setItems([]);
    block.clear();
  }

  public isWon(): boolean {
    return this._model.isWon;
  }

  // --- internals ----------------------------------------------------------

  /**
   * Removes every item of `block` from its cells at the current anchor,
   * updates the anchor, then re-adds the items at the new anchor's cells.
   * Order matters: detaching all first lets the new cells overlap the
   * old ones (e.g., a 1-step slide along the shape's long axis).
   */
  private _moveBlockToAnchor(block: Block, newAnchor: CellCoord): void {
    if (block.anchor.col === newAnchor.col && block.anchor.row === newAnchor.row) return;
    const grid = this._requireGrid();
    const detached: BlockItem[] = [];
    for (const offset of block.shape) {
      const item = grid.removeCellItem(block.anchor.col + offset.col, block.anchor.row + offset.row);
      if (item) detached.push(item as BlockItem);
    }
    block.setAnchor(newAnchor);
    for (let i = 0; i < block.shape.length; i++) {
      const offset = block.shape[i]!;
      const item = detached[i];
      if (!item) continue;
      grid.addCellItem(newAnchor.col + offset.col, newAnchor.row + offset.row, item);
    }
    block.setItems(detached);
  }

  /**
   * Clamps a proposed X move against per-cell (not bounding-box) collisions.
   *
   * Stateless side-check: for every (dragged shape cell, occupied grid cell)
   * pair that overlaps on the Z axis, the dragged cell's X range must not
   * cross the obstacle's X range. The clamp is written in terms of
   * "obstacle is not fully to the left" (for rightward motion) and "not
   * fully to the right" (for leftward motion), so a float-drift position
   * of `1.0000001` reaches the same clamp decision as an exact `1.0`.
   */
  private _clampAxisX(block: Block, currentCol: number, currentRow: number, targetCol: number): number {
    const W = block.width;
    const cols = this._levels.current.cols;
    const m = this._config.blockMargin;

    const moving = targetCol - currentCol;
    if (Math.abs(moving) < 1e-9) return currentCol;

    let leftLimit = 0;
    let rightLimit = cols - W;

    const eps = 1e-6;
    for (const otherCell of this._collectOccupiedCellsExcept(block.id)) {
      for (const shapeCell of block.shape) {
        const dRow = currentRow + shapeCell.row;
        const oRow = otherCell.row;
        if (dRow + (1 - m) <= oRow + m + eps) continue;
        if (dRow + m >= oRow + (1 - m) - eps) continue;

        const dCol = currentCol + shapeCell.col;
        const oCol = otherCell.col;

        if (moving > 0 && oCol + (1 - m) > dCol + m + eps) {
          rightLimit = Math.min(rightLimit, oCol - shapeCell.col - 1 + 2 * m);
        } else if (moving < 0 && oCol + m < dCol + (1 - m) - eps) {
          leftLimit = Math.max(leftLimit, oCol + 1 - 2 * m - shapeCell.col);
        }
      }
    }

    return Math.max(leftLimit, Math.min(rightLimit, targetCol));
  }

  private _clampAxisZ(block: Block, currentCol: number, currentRow: number, targetRow: number): number {
    const H = block.height;
    const rows = this._levels.current.rows;
    const m = this._config.blockMargin;

    const moving = targetRow - currentRow;
    if (Math.abs(moving) < 1e-9) return currentRow;

    let topLimit = 0;
    let bottomLimit = rows - H;

    const eps = 1e-6;
    for (const otherCell of this._collectOccupiedCellsExcept(block.id)) {
      for (const shapeCell of block.shape) {
        const dCol = currentCol + shapeCell.col;
        const oCol = otherCell.col;
        if (dCol + (1 - m) <= oCol + m + eps) continue;
        if (dCol + m >= oCol + (1 - m) - eps) continue;

        const dRow = currentRow + shapeCell.row;
        const oRow = otherCell.row;

        if (moving > 0 && oRow + (1 - m) > dRow + m + eps) {
          bottomLimit = Math.min(bottomLimit, oRow - shapeCell.row - 1 + 2 * m);
        } else if (moving < 0 && oRow + m < dRow + (1 - m) - eps) {
          topLimit = Math.max(topLimit, oRow + 1 - 2 * m - shapeCell.row);
        }
      }
    }

    return Math.max(topLimit, Math.min(bottomLimit, targetRow));
  }

  /**
   * Cells in the grid whose top item is a `BlockItem` from a different
   * group than `excludeGroupId`. Skips empty cells. Used by collision
   * clamping so the dragged block doesn't collide with itself.
   */
  private _collectOccupiedCellsExcept(excludeGroupId: number): CellCoord[] {
    const grid = this._requireGrid();
    const out: CellCoord[] = [];
    for (let col = 0; col < grid.columnCount; col++) {
      for (let row = 0; row < grid.rowCount; row++) {
        const cell = grid.getCell(col, row);
        if (!cell || cell.size === 0) continue;
        const item = cell.item;
        if (!(item instanceof BlockItem)) continue;
        if (item.groupId === excludeGroupId) continue;
        out.push({ col, row });
      }
    }
    return out;
  }

  /**
   * Returns `{ doorId, side }` when the block at the integer cell
   * (`col`, `row`) sits on an edge cell whose door matches it (colour,
   * perpendicular span contains the block).
   */
  private _findExitAt(block: Block, col: number, row: number): { doorId: number; side: DoorSide } | null {
    const W = block.width;
    const H = block.height;
    if (row === 0) {
      const door = this._findMatchingDoor("top", block, col);
      if (door) return { doorId: door.id, side: "top" };
    }
    if (row === this._levels.current.rows - H) {
      const door = this._findMatchingDoor("bottom", block, col);
      if (door) return { doorId: door.id, side: "bottom" };
    }
    if (col === 0) {
      const door = this._findMatchingDoor("left", block, row);
      if (door) return { doorId: door.id, side: "left" };
    }
    if (col === this._levels.current.cols - W) {
      const door = this._findMatchingDoor("right", block, row);
      if (door) return { doorId: door.id, side: "right" };
    }
    return null;
  }

  /**
   * Verifies that the block can complete its exit animation without
   * sweeping through another block's cell. Walks the block one cardinal
   * cell at a time from `startAnchor` in the exit direction; at each
   * intermediate anchor, any in-grid shape cell must be empty (or hold
   * only this block's own items).
   */
  private _isExitPathClear(block: Block, startAnchor: CellCoord, side: DoorSide): boolean {
    let dCol = 0;
    let dRow = 0;
    let steps = 0;
    if (side === "top") {
      dRow = -1;
      steps = block.height;
    } else if (side === "bottom") {
      dRow = 1;
      steps = block.height;
    } else if (side === "left") {
      dCol = -1;
      steps = block.width;
    } else if (side === "right") {
      dCol = 1;
      steps = block.width;
    }

    const grid = this._requireGrid();
    for (let i = 1; i <= steps; i++) {
      const anchor = { col: startAnchor.col + dCol * i, row: startAnchor.row + dRow * i };
      const cells = block.absoluteCellsAt(anchor);
      for (const cell of cells) {
        if (cell.col < 0 || cell.col >= this._levels.current.cols) continue;
        if (cell.row < 0 || cell.row >= this._levels.current.rows) continue;
        const occupant = grid.getCell(cell.col, cell.row)?.item;
        if (!occupant) continue;
        if (!(occupant instanceof BlockItem)) continue;
        if (occupant.groupId === block.id) continue;
        return false;
      }
    }
    return true;
  }

  /**
   * Finds a door on `side` that `block` can pass through from perpendicular
   * start index `perpStart` (= anchor.col for top/bottom, anchor.row for
   * left/right).
   */
  private _findMatchingDoor(
    side: "top" | "bottom" | "left" | "right",
    block: Block,
    perpStart: number,
  ): Door | null {
    const spanLen = side === "top" || side === "bottom" ? block.width : block.height;
    for (const door of this._model.doors) {
      if (door.side !== side) continue;
      if (door.colorIndex !== block.colorIndex) continue;
      if (spanLen > door.spanLength) continue;
      if (perpStart < door.spanStart) continue;
      if (perpStart + spanLen - 1 > door.spanEnd) continue;
      return door;
    }
    return null;
  }

  private _snapToLegalAnchor(block: Block, finalPos: FloatPos): CellCoord {
    const cols = this._levels.current.cols;
    const rows = this._levels.current.rows;
    const W = block.width;
    const H = block.height;

    let col = Math.max(0, Math.min(cols - W, Math.round(finalPos.col)));
    let row = Math.max(0, Math.min(rows - H, Math.round(finalPos.row)));

    if (this._canOccupyInGridAt(block, { col, row })) return { col, row };

    // Fallback: scan outward for a nearby legal cell.
    for (let r = 1; r <= 2; r++) {
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
          const cc = col + dc;
          const rr = row + dr;
          if (cc < 0 || cc > cols - W) continue;
          if (rr < 0 || rr > rows - H) continue;
          if (this._canOccupyInGridAt(block, { col: cc, row: rr })) {
            col = cc;
            row = rr;
            return { col, row };
          }
        }
      }
    }
    return block.anchor;
  }

  private _canOccupyInGridAt(block: Block, anchor: CellCoord): boolean {
    const grid = this._requireGrid();
    const cells = block.absoluteCellsAt(anchor);
    for (const cell of cells) {
      if (cell.col < 0 || cell.col >= this._levels.current.cols) return false;
      if (cell.row < 0 || cell.row >= this._levels.current.rows) return false;
      const occupant = grid.getCell(cell.col, cell.row)?.item;
      if (!occupant) continue;
      if (!(occupant instanceof BlockItem)) return false;
      if (occupant.groupId !== block.id) return false;
    }
    return true;
  }

  private _assertNoOverlappingDoors(doors: readonly Door[]): void {
    const bySide = new Map<string, Door[]>();
    for (const door of doors) {
      const list = bySide.get(door.side) ?? [];
      list.push(door);
      bySide.set(door.side, list);
    }
    for (const [side, list] of bySide) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          if (a.spanStart <= b.spanEnd && b.spanStart <= a.spanEnd) {
            throw new Error(
              `Color Block Jam: doors ${a.id} and ${b.id} overlap on side '${side}' (spans ${a.spanStart}-${a.spanEnd} and ${b.spanStart}-${b.spanEnd}).`,
            );
          }
        }
      }
    }
  }

  private _requireGrid(): RectGrid {
    if (!this._grid) throw new Error("GameOperations: grid is not built — call buildLevel() first");
    return this._grid;
  }
}
