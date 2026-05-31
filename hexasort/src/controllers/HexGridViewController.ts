import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import { IHexGrid } from "../models/IHexGrid.js";
import type { BlockStack } from "../models/BlockStack.js";
import { HexaSortConfig } from "../HexaSortConfig.js";
import { GameEvents } from "../events/GameEvents.js";
import { SortingManager } from "../utilities/SortingManager.js";
import { GameOperations } from "../utilities/GameOperations.js";
import { SfxService } from "../services/SfxService.js";
import type { HexCellCoord, IHexGridView } from "../views/IHexGridView.js";

/**
 * Grid-side orchestration:
 * - translates horizontal drag deltas into grid Y rotation (suppressed
 *   while a stack is being dragged, so rotation and drag-drop are fully
 *   independent),
 * - tracks which cell the pointer is over and highlights it when a drop
 *   is in progress and the cell is empty,
 * - on stack release, delegates the placement mutation to
 *   {@link GameOperations}, updates the view, emits `onStackPlaced`
 *   (or `onStackDropCancelled`) and enqueues a sort sequence through
 *   {@link SortingManager},
 * - listens for {@link GameEvents.onSortMoveStarted} /
 *   {@link GameEvents.onBlockDestroyStarted} and drives the view's
 *   animation methods. The `SortingManager` owns no view reference —
 *   this controller is the single bridge between the manager's model
 *   mutations and the grid view's tweens, keeping the renderer-facing
 *   code in one place.
 *
 * Controller-layer rule compliance:
 * - Only holds the readonly {@link IHexGrid} — all mutations go through
 *   `GameOperations.placeStackOnGrid`.
 * - References the view only through {@link IHexGridView}.
 */
export class HexGridViewController implements IViewController<IHexGridView> {
  private _grid: IHexGrid | null = null;
  private _config: HexaSortConfig | null = null;
  private _events: GameEvents | null = null;
  private _scheduler: SortingManager | null = null;
  private _ops: GameOperations | null = null;
  private _sfx: SfxService | null = null;
  private _view: IHexGridView | null = null;

  private _rotationY = 0;
  private _draggedStack: BlockStack | null = null;
  private _hoveredCell: HexCellCoord | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._grid = resolver.getInstance(IHexGrid);
    this._config = resolver.getInstance(HexaSortConfig);
    this._events = resolver.getInstance(GameEvents);
    this._scheduler = resolver.getInstance(SortingManager);
    this._ops = resolver.getInstance(GameOperations);
    this._sfx = resolver.getInstance(SfxService);
  }

  public initialize(view: IHexGridView): void {
    if (!this._grid || !this._config || !this._events || !this._scheduler || !this._ops) {
      throw new Error("HexGridViewController is not initialized");
    }
    this._view = view;

    view.buildGrid(this._grid);
    view.setRotationY(this._rotationY);

    this._subs.add(view.onHorizontalDrag((dx) => this._applyDragDelta(dx)));
    this._subs.add(view.onCellHoverChanged((cell) => this._handleHoverChanged(cell)));
    this._subs.add(this._events.onStackPickedUp((stack) => this._handleStackPickedUp(stack)));
    this._subs.add(this._events.onStackReleased(() => this._handleStackReleased()));
    this._subs.add(
      this._events.onSortMoveStarted((sc, sr, tc, tr, color) => this._onSortMoveStarted(sc, sr, tc, tr, color)),
    );
    this._subs.add(this._events.onBlockDestroyStarted((col, row) => this._onBlockDestroyStarted(col, row)));
  }

  public destroy(): void {
    this._subs.flush();
    this._scheduler = null;
    this._ops = null;
    this._sfx = null;
    this._view = null;
    this._grid = null;
    this._config = null;
    this._events = null;
    this._draggedStack = null;
    this._hoveredCell = null;
  }

  private _applyDragDelta(deltaPixelsX: number): void {
    // Independence: while a stack is being dragged, the grid must not rotate.
    if (this._draggedStack !== null) return;
    if (!this._config || !this._view) return;
    this._rotationY += deltaPixelsX * this._config.dragRotationSensitivity;
    this._view.setRotationY(this._rotationY);
  }

  private _handleHoverChanged(cell: HexCellCoord | null): void {
    this._hoveredCell = cell;
    if (this._draggedStack === null) return;
    this._refreshHighlightForDragHover();
  }

  private _handleStackPickedUp(stack: BlockStack): void {
    this._draggedStack = stack;
    this._refreshHighlightForDragHover();
  }

  private _handleStackReleased(): void {
    const stack = this._draggedStack;
    this._draggedStack = null;
    if (!stack || !this._view || !this._events || !this._ops) {
      this._view?.clearHighlight();
      return;
    }
    const target = this._hoveredCell;
    this._view.clearHighlight();

    if (target && this._ops.canPlaceStack(target.col, target.row)) {
      // Mutation routed through GameOperations so the controller stays
      // on the readonly IHexGrid interface.
      this._ops.placeStackOnGrid(target.col, target.row, stack);
      this._view.renderBlockStack(target.col, target.row, stack.colors);
      this._events.emitStackPlaced(stack, target.col, target.row);
      // Every successful placement enqueues a sort sequence. The manager
      // guarantees only one sequence runs at a time; further placements
      // queue without interrupting the ongoing one.
      this._scheduler?.enqueuePlacement(target.col, target.row);
    } else {
      this._events.emitStackDropCancelled(stack);
    }
  }

  private _refreshHighlightForDragHover(): void {
    if (!this._view || !this._ops) return;
    const cell = this._hoveredCell;
    if (cell && this._ops.canPlaceStack(cell.col, cell.row)) {
      this._view.setHighlightedCell(cell.col, cell.row);
    } else {
      this._view.clearHighlight();
    }
  }

  // --- Manager → view animation bridge ------------------------------------

  private _onSortMoveStarted(
    srcCol: number,
    srcRow: number,
    tgtCol: number,
    tgtRow: number,
    colorIndex: number,
  ): void {
    this._view?.animateBlockMove(srcCol, srcRow, tgtCol, tgtRow, colorIndex, () => this._sfx?.playTileLand());
  }

  private _onBlockDestroyStarted(col: number, row: number): void {
    this._view?.animateBlockDestroy(col, row, () => {
      /* manager advances on its own time-based cadence */
    });
  }
}
