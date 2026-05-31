import {
  UnsubscribeBag,
  UpdateManager,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import type { Block } from "../models/Block.js";
import { ColorBlockJamConfig } from "../ColorBlockJamConfig.js";
import type { CellCoord } from "../constants/BoardTypes.js";
import { GameOperations, type FloatPos } from "../utilities/GameOperations.js";
import { GameEvents } from "../events/GameEvents.js";
import { LevelManager } from "../utilities/LevelManager.js";
import { SfxService } from "../services/SfxService.js";
import type { GridPointer, IBoardView } from "../views/IBoardView.js";

/**
 * Board-side orchestration for the Color Block Jam level.
 *
 * Drag flow:
 * - Pointer-down captures the block, the pointer's grab offset, and the
 *   block's starting anchor. The `_dragTarget` (where the cursor wants
 *   the block to be) is seeded to that anchor so the block starts at
 *   rest.
 * - Pointer-move ONLY updates `_dragTarget` — it doesn't nudge the
 *   block. This is what makes motion feel smooth: the block doesn't
 *   teleport to every cursor sample.
 * - A per-frame tick (via {@link UpdateManager}) eases `_dragPos` toward
 *   `_dragTarget` using exponential damping
 *   (`factor = 1 - exp(-dt / dragSmoothingTime)`) and then passes the
 *   eased position through {@link GameOperations.clampDragStep} so the
 *   block's *actual* position stays legal under collision + grid-edge
 *   rules at every frame. The view is updated with the clamped result.
 *   After each step we also re-check {@link GameOperations.detectExitTrigger}
 *   so a smooth slide into a matching door fires the exit animation.
 * - Pointer-up commits through {@link GameOperations.commitRelease},
 *   which snaps to the nearest legal integer cell or starts the exit
 *   animation if the block was dropped in front of a matching door.
 *
 * Level progression:
 *  - Initialization loads level 0 + builds the scene.
 *  - {@link GameEvents.onAdvanceLevel} (from the win popup) triggers
 *    `_loadCurrentLevel`, which tears the current board down and
 *    rebuilds from the next descriptor.
 *
 * Clearing is two-phase so the exit animation has time to play: ops
 * reports the intent, the view animates, and `_finishExit` commits the
 * model mutation + events on animation complete.
 */
export class BoardViewController implements IViewController<IBoardView> {
  private _model: IGameModelType | null = null;
  private _ops: GameOperations | null = null;
  private _events: GameEvents | null = null;
  private _levels: LevelManager | null = null;
  private _config: ColorBlockJamConfig | null = null;
  private _sfx: SfxService | null = null;
  private _view: IBoardView | null = null;

  private _draggedBlock: Block | null = null;
  /** Smoothed visual position of the dragged block (clamp-legal). */
  private _dragPos: FloatPos = { col: 0, row: 0 };
  /** Raw cursor target the block eases toward each frame (pre-clamp). */
  private _dragTarget: FloatPos = { col: 0, row: 0 };
  private _grabOffsetCol = 0;
  private _grabOffsetRow = 0;
  private readonly _exitingBlockIds = new Set<number>();

  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._model = resolver.getInstance(IGameModel);
    this._ops = resolver.getInstance(GameOperations);
    this._events = resolver.getInstance(GameEvents);
    this._levels = resolver.getInstance(LevelManager);
    this._config = resolver.getInstance(ColorBlockJamConfig);
    this._sfx = resolver.getInstance(SfxService);
    const updates = resolver.getInstance(UpdateManager);
    this._subs.add(updates.register((dt) => this._tickDrag(dt)));
  }

  public initialize(view: IBoardView): void {
    if (!this._model || !this._ops || !this._events || !this._levels || !this._config) {
      throw new Error("BoardViewController is not initialized");
    }
    this._view = view;

    this._loadCurrentLevel();

    this._subs.add(view.onBlockPointerDown((blockId, pointer) => this._onPick(blockId, pointer)));
    this._subs.add(view.onDragMove((pointer) => this._onMove(pointer)));
    this._subs.add(view.onDragEnd((pointer) => this._onRelease(pointer)));
    this._subs.add(this._events.onAdvanceLevel(() => this._onAdvanceLevel()));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._model = null;
    this._ops = null;
    this._events = null;
    this._levels = null;
    this._config = null;
    this._sfx = null;
    this._draggedBlock = null;
    this._exitingBlockIds.clear();
  }

  private _loadCurrentLevel(): void {
    if (!this._view || !this._ops || !this._model || !this._levels || !this._events) return;
    this._draggedBlock = null;
    this._exitingBlockIds.clear();
    this._view.clearBoard();
    this._ops.buildLevel();
    const level = this._levels.current;
    this._view.buildBoard(level.cols, level.rows, this._model.doors);
    for (const block of this._model.blocks) this._view.addBlock(block);
    this._events.emitLevelChanged(this._levels.index);
  }

  private _onAdvanceLevel(): void {
    if (!this._levels) return;
    this._levels.advance();
    this._loadCurrentLevel();
  }

  private _onPick(blockId: number, pointer: GridPointer): void {
    if (!this._model || !this._view) return;
    if (this._exitingBlockIds.has(blockId)) return;
    const block = this._model.getBlockById(blockId);
    if (!block || block.cleared) return;
    this._draggedBlock = block;
    this._dragPos = { col: block.anchor.col, row: block.anchor.row };
    this._dragTarget = { col: block.anchor.col, row: block.anchor.row };
    this._grabOffsetCol = pointer.col - block.anchor.col;
    this._grabOffsetRow = pointer.row - block.anchor.row;
    this._view.setBlockLifted(blockId, true);
    this._view.setBlockSelected(blockId, true);
    this._sfx?.playPickup();
  }

  private _onMove(pointer: GridPointer): void {
    if (!this._draggedBlock) return;
    // Only update the raw target; the per-frame tick drives the block
    // toward it. This is what keeps motion smooth instead of snapping
    // one pointer sample at a time.
    this._dragTarget = {
      col: pointer.col - this._grabOffsetCol,
      row: pointer.row - this._grabOffsetRow,
    };
  }

  /**
   * Eases the block's clamped position toward the cursor's target each
   * frame, running collision + grid-edge checks on the eased result so
   * the block slides along obstacles rather than tunneling through them.
   * Auto-triggers exit when a matching door opens up during the slide.
   */
  private _tickDrag(dt: number): void {
    if (!this._draggedBlock || !this._view || !this._ops || !this._events || !this._config) return;
    const block = this._draggedBlock;
    const factor = 1 - Math.exp(-dt / Math.max(this._config.dragSmoothingTime, 1e-4));
    const easedCol = this._dragPos.col + (this._dragTarget.col - this._dragPos.col) * factor;
    const easedRow = this._dragPos.row + (this._dragTarget.row - this._dragPos.row) * factor;
    const next = this._ops.clampDragStep(block.id, this._dragPos, { col: easedCol, row: easedRow });
    if (!next) return;
    this._dragPos = next;
    this._view.setBlockAnchor(block.id, next.col, next.row);

    const trigger = this._ops.detectExitTrigger(block.id, next);
    if (trigger) this._beginExit(block, trigger.doorId, trigger.anchor);
  }

  private _onRelease(_pointer: GridPointer): void {
    if (!this._view || !this._ops || !this._events) {
      this._draggedBlock = null;
      return;
    }
    const block = this._draggedBlock;
    this._draggedBlock = null;
    if (!block) return;

    const result = this._ops.commitRelease(block.id, this._dragPos);
    if (!result) return;

    if (result.kind === "exit") {
      this._beginExit(block, result.doorId, result.anchor);
    } else {
      this._view.setBlockLifted(block.id, false);
      this._view.setBlockSelected(block.id, false);
      this._view.setBlockAnchor(block.id, result.anchor.col, result.anchor.row);
      this._sfx?.playDrop();
    }
  }

  /**
   * Snaps the block's visual into the exit-adjacent cell, then plays the
   * exit animation from there. Same flow for drag-time auto-trigger and
   * on-release commit — in both cases the animation starts from the
   * snapped integer anchor, never from a mid-drag float offset.
   */
  private _beginExit(block: Block, doorId: number, anchor: CellCoord): void {
    if (!this._view || !this._ops) return;
    if (this._exitingBlockIds.has(block.id)) return;
    this._exitingBlockIds.add(block.id);
    if (this._draggedBlock?.id === block.id) this._draggedBlock = null;
    this._view.setBlockLifted(block.id, false);
    this._view.setBlockSelected(block.id, false);
    this._view.setBlockAnchor(block.id, anchor.col, anchor.row);
    // Vacate the grid cells now so other blocks can move into the
    // departing space while the exit visual still plays out.
    this._ops.clearBlock(block.id);
    this._sfx?.playGateShred();
    this._view.animateExit(block.id, doorId, () => this._finishExit(block.id, doorId));
  }

  private _finishExit(blockId: number, doorId: number): void {
    if (!this._view || !this._ops || !this._events) {
      this._exitingBlockIds.delete(blockId);
      return;
    }
    this._view.removeBlock(blockId);
    this._events.emitBlockCleared(blockId, doorId);
    this._exitingBlockIds.delete(blockId);
    if (this._ops.isWon()) this._events.emitWin();
  }
}
