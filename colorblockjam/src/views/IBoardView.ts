import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { GridPointer } from "../constants/DragTypes.js";
import type { Block } from "../models/Block.js";
import type { Door } from "../models/Door.js";

export type { GridPointer } from "../constants/DragTypes.js";

/**
 * World-side 3D view of the Color Block Jam board: grid plate, colored
 * door markers on the edges, and block cuboids on the grid. The view
 * owns all Three.js rendering and pointer-to-grid projection; it never
 * touches the game model or applies domain rules. Controllers receive
 * pointer events in grid space and call back with float anchor updates.
 */
export interface IBoardView extends IView {
  /**
   * Builds (or rebuilds) the grid + door markers for the given level. The
   * view keeps its own `cols`/`rows` state from these args — subsequent
   * level switches should call this method after `clearBoard`.
   */
  buildBoard(cols: number, rows: number, doors: readonly Door[]): void;

  /** Removes every rendered block, door, grid cell, and tween. */
  clearBoard(): void;

  /** Adds a block to the board at its current anchor. */
  addBlock(block: Block): void;

  /** Removes a block from the board (after a successful exit). */
  removeBlock(blockId: number): void;

  /**
   * Moves the block to the given float anchor, in grid coordinates. Values
   * outside `[0, gridCols - W]` / `[0, gridRows - H]` slide it visibly off
   * the grid through a door.
   */
  setBlockAnchor(blockId: number, col: number, row: number): void;

  /** Lifts the block vertically while dragging, flat otherwise. */
  setBlockLifted(blockId: number, lifted: boolean): void;

  /**
   * Shows / hides a white outline around the block's shape footprint so
   * the player can see which block is currently being dragged. The
   * outline must render on top of every other block (depth-test off,
   * high render order) so it stays visible when the dragged block
   * passes over or close to others.
   */
  setBlockSelected(blockId: number, selected: boolean): void;

  /**
   * Runs the exit animation for a block passing through `doorId`:
   *  - tweens the block's position outward through the gate, clipped
   *    against the grid edge so the part past the wall disappears,
   *  - spawns a coloured particle burst on the outside of the gate,
   *  - triggers the gate's button-press scale animation once the block
   *    is fully consumed,
   *  - calls `onComplete` so the controller can finalize the clear.
   */
  animateExit(blockId: number, doorId: number, onComplete: () => void): void;

  /**
   * Subscribes to a pointer-down on a block mesh. The pointer's grid
   * position at press-time is reported alongside the block id.
   */
  onBlockPointerDown(cb: (blockId: number, pointer: GridPointer) => void): Unsubscribe;

  /** Subscribes to pointer-move events while a drag is active. */
  onDragMove(cb: (pointer: GridPointer) => void): Unsubscribe;

  /**
   * Subscribes to pointer-up / pointer-cancel while a drag is active.
   * Fires with the final pointer grid position.
   */
  onDragEnd(cb: (pointer: GridPointer) => void): Unsubscribe;
}
