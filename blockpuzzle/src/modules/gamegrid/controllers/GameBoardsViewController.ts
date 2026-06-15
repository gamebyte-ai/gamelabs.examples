import type { GridCoord, IBaseGrid, IGridItem, IInstanceResolver, RectGrid, RectGridPreset } from "@gamebyte/gamelabsjs";
import type { PieceType } from "../../../BlockPuzzleConfig";
import {
  GridEvents,
  GridsModel,
  GridsViewController,
  ParticleManager,
  UnsubscribeBag,
  UpdateManager,
} from "@gamebyte/gamelabsjs";
import { BlockPuzzleConfig } from "../../../BlockPuzzleConfig";
import { GameState } from "../../../constants/GameState";
import { BoosterPanelState } from "../../../constants/BoosterPanelState";
import { BoosterType } from "../../../constants/BoosterType";
import { TrayEvents } from "../../../events/TrayEvents";
import { BoosterPanelModel } from "../../../models/BoosterPanelModel";
import { ComboModel } from "../../../models/ComboModel";
import { GameStateModel } from "../../../models/GameStateModel";
import { ScoreModel } from "../../../models/ScoreModel";
import { TrayPlaceabilityModel } from "../../../models/TrayPlaceabilityModel";
import { ItemIdGenerator } from "../../../utilities/ItemIdGenerator";
import { LineClearRule } from "../../../utilities/LineClearRule";
import { PiecePlacementOperations } from "../../../utilities/PiecePlacementOperations";
import { PieceSpawnOperations } from "../../../utilities/PieceSpawnOperations";
import { GameBoardItem } from "../models/GameBoardItem";
import type { ClearPreviewResult, IGameBoardsView, PiecePlacementInfo, TrayPlaceability } from "../views/IGameBoardsView";
import { GameBoardItemObjectOptions } from "../views/GameBoardItemObjectOptions";

/**
 * Boards view controller — extends the framework's
 * {@link GridsViewController} with:
 *
 * - item-options construction that forwards `item.cells` straight
 *   to the visual (tray items already carry a rotated full shape;
 *   grid items already carry a single-block layout — set by the
 *   spawner / placement op respectively)
 * - drag-driven placement: installs the validity predicate on the
 *   view, listens for the view's `onPiecePlacement` event, and
 *   commits the model mutation via {@link PiecePlacementOperations}
 * - per-placement recompute of tray placeability + game-over state:
 *   after every grid mutation (placement / clear / refill), each
 *   tray piece is tested against the post-mutation grid; unplaceable
 *   pieces fade on the view; once every non-empty slot is
 *   unplaceable, `GameState.GameOver` fires and drag is disabled.
 *
 * The view stays render-only and never touches the model — every
 * model mutation flows through this controller.
 */
export class GameBoardsViewController extends GridsViewController {
  private _config: BlockPuzzleConfig | null = null;
  private _gridsModel: GridsModel | null = null;
  private _gridEvents: GridEvents | null = null;
  private _ids: ItemIdGenerator | null = null;
  private _clearRule: LineClearRule | null = null;
  private _gameState: GameStateModel | null = null;
  private _scoreModel: ScoreModel | null = null;
  private _comboModel: ComboModel | null = null;
  private _boosterPanel: BoosterPanelModel | null = null;
  private _placeabilityModel: TrayPlaceabilityModel | null = null;
  private _boardsView: IGameBoardsView | null = null;
  private _particleManager: ParticleManager | null = null;
  private _updateManager: UpdateManager | null = null;
  private _trayEvents: TrayEvents | null = null;
  /** Coalescing flag for {@link _scheduleRecompute}. A single
   *  `_onPiecePlacement` commit fires N+1+M+K grid events; we want
   *  one recompute at the end, not per-event. */
  private _recomputePending = false;
  /** Hammer wobble lifecycle. While Hammer Selecting is active, the
   *  per-frame tick increments `_wobbleTime` and pushes it to the
   *  view; on exit the controller pushes `null` once to snap blocks
   *  back to rest. Tracked here (not on the booster panel) because
   *  it's a view-pacing concern, not a model state. */
  private _wobbleActive = false;
  private _wobbleTime = 0;
  /** Grid impact-shake state. `_gridShakeTime !== null` while a
   *  shake is in flight; `_gridShakeAmplitude` is captured at trigger
   *  time so the per-frame integrator uses the same amplitude (which
   *  scales with the placement's line count). */
  private _gridShakeTime: number | null = null;
  private _gridShakeAmplitude = 0;
  /** Tracks whether the boards view is currently in Unit Block mode
   *  so {@link _syncUnitBlockMode} only enters / exits on real
   *  transitions (not on every booster-panel onChange tick). */
  private _unitBlockEntered = false;
  /** True between Tray Refresh request and the moment the new hand
   *  is committed. Used to defer the game-over check, which would
   *  otherwise fire on the recompute scheduled by the booster's
   *  `consume()` (state flips to Charging while the *old* tray is
   *  still in the model — animation hasn't completed yet) and end
   *  the game before the new pieces even exist. */
  private _trayRefreshInFlight = false;
  /** Colour sampled from `blockColors` for the active Unit Block
   *  session. Captured at entry so the placed grid item matches the
   *  temp piece the player dragged. `null` outside Unit Block mode. */
  private _unitBlockColor: number | null = null;
  private readonly _ownSubs = new UnsubscribeBag();

  /** Synthetic piece type used by Unit Block placements so the
   *  resulting grid item has the same shape as any other 1-cell
   *  item placed by a normal piece commit. */
  private static readonly UNIT_BLOCK_PIECE_TYPE: PieceType = {
    name: "UnitBlockBooster",
    cells: [[0, 0]],
  };

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BlockPuzzleConfig);
    this._gridsModel = resolver.getInstance(GridsModel);
    this._gridEvents = resolver.getInstance(GridEvents);
    this._ids = resolver.getInstance(ItemIdGenerator);
    this._clearRule = resolver.getInstance(LineClearRule);
    this._gameState = resolver.getInstance(GameStateModel);
    this._scoreModel = resolver.getInstance(ScoreModel);
    this._comboModel = resolver.getInstance(ComboModel);
    this._boosterPanel = resolver.getInstance(BoosterPanelModel);
    this._placeabilityModel = resolver.getInstance(TrayPlaceabilityModel);
    this._particleManager = resolver.getInstance(ParticleManager);
    this._updateManager = resolver.getInstance(UpdateManager);
    this._trayEvents = resolver.getInstance(TrayEvents);
  }

  public override initialize(view: IGameBoardsView): void {
    super.initialize(view);
    this._boardsView = view;
    view.setPlacementPredicate((footprint) => this._canPlace(footprint));
    view.setClearPreviewProvider((footprint) => this._predictClears(footprint));
    this._ownSubs.add(view.onPiecePlacement((info) => this._onPiecePlacement(info)));
    // Recompute tray placeability + game-over after grid mutations.
    // Subscribes go through {@link _scheduleRecompute} so a multi-
    // step commit (place + tray remove + line clears + refill) ends
    // up with one recompute over the **final** post-commit state,
    // not one per intermediate event. Reading mid-commit can latch
    // GameOver from a transient state where the line clear hasn't
    // run yet but the tray piece is already gone.
    if (this._gridEvents) {
      this._ownSubs.add(this._gridEvents.onItemAdded(() => this._scheduleRecompute()));
      this._ownSubs.add(this._gridEvents.onItemRemoved(() => this._scheduleRecompute()));
      // Unit Block mode entry needs the tray grid in place to
      // compute the temp piece's world position — re-sync once the
      // tray is added so test-mode startup (App constructs the
      // booster panel directly in Selecting) still spawns the temp
      // piece.
      this._ownSubs.add(this._gridEvents.onGridAdded(() => this._syncUnitBlockMode()));
    }
    // Booster panel state shifts (consume → Charging, select →
    // Selecting, cancel → Ready) without any grid event, so
    // subscribe explicitly — the recompute updates the drag /
    // cell-tap gates AND can fire a deferred game-over that was
    // held off while the panel was Ready. The mode-sync runs first
    // (synchronously, before the debounced recompute) so the Unit
    // Block visual is in place by the time recompute reads its
    // placeability.
    if (this._boosterPanel) {
      this._ownSubs.add(this._boosterPanel.onChange(() => this._onBoosterPanelChange()));
    }
    // Terminal transitions (TimeUp / GameOver) need to flip drag off
    // too. Recompute re-evaluates the gate against the new game
    // state and the view aborts any in-flight drag inside
    // `setDragEnabled(false)`.
    if (this._gameState) {
      this._ownSubs.add(this._gameState.onStateChanged(() => this._scheduleRecompute()));
    }
    // Initial Unit Block sync — if the App started directly in
    // UnitBlock Selecting (test mode), enter mode now so the temp
    // piece spawns at the right time relative to the initial deal.
    this._syncUnitBlockMode();
    // Drop of the Unit Block temp piece on a valid empty grid cell —
    // commit a 1-cell grid item and consume the booster.
    this._ownSubs.add(view.onUnitBlockPlacement((footprint) => this._handleUnitBlockPlacement(footprint)));
    // Grid-cell taps for booster target selection (Hammer). Wired
    // even when the panel isn't Selecting — the view's gate is the
    // master switch.
    this._ownSubs.add(view.onGridCellTapped((col, row) => this._handleGridCellTap(col, row)));
    // Initial scene-background gradient. `_recomputeTrayState`
    // keeps it in sync afterward (swaps to the `selecting` variant
    // while a target-selection booster is pending; reverts
    // otherwise).
    if (this._config) {
      const bg = this._config.backgroundColors.default;
      view.setBackgroundGradient(bg.top, bg.bottom);
    }

    // Particle pipeline — register the Hammer emitter so the
    // framework's `ParticleManager` ticks it every frame and bursts
    // get drawn / lifetimed correctly.
    if (this._particleManager) {
      this._particleManager.register(view.hammerEmitter);
      this._particleManager.register(view.unitBlockSparkleEmitter);
    }

    // Per-frame wobble lifecycle — see `_onTick`. Single registration
    // for the lifetime of the controller; the tick gates on the
    // booster panel state internally.
    if (this._updateManager) {
      this._ownSubs.add(this._updateManager.register((dt) => this._onTick(dt)));
    }

    // Tray Refresh booster — the HUD controller consumes the booster
    // and fires this event; we own the tray view + animation pipeline
    // so we orchestrate the exit slide, model clear, and re-deal here.
    if (this._trayEvents) {
      this._ownSubs.add(this._trayEvents.onRefreshRequested(() => this._onTrayRefreshRequested()));
    }
  }

  protected override createItemObjectOption(item: IGridItem, grid: IBaseGrid): GameBoardItemObjectOptions {
    if (!(item instanceof GameBoardItem)) {
      throw new Error("GameBoardsViewController: expected GameBoardItem");
    }
    if (!this._config) {
      throw new Error("GameBoardsViewController: config not injected");
    }
    const blockSize = this._config.blockSizeFor(grid.gridId);
    // `grid.preset` is typed as the shape-agnostic `IGridPreset` on
    // the base controller. Both surfaces here use `RectGridPreset`,
    // and the item visual's `preset` is `declare`d as `RectGridPreset`
    // for that reason — so a narrowing cast at the seam is what the
    // framework expects.
    return new GameBoardItemObjectOptions(item.itemId, grid.preset as RectGridPreset, item, item.cells, item.color, blockSize);
  }

  public override destroy(): void {
    this._ownSubs.flush();
    if (this._particleManager && this._boardsView) {
      this._particleManager.unregister(this._boardsView.hammerEmitter);
      this._particleManager.unregister(this._boardsView.unitBlockSparkleEmitter);
    }
    this._boardsView?.setPlacementPredicate(null);
    this._boardsView?.setClearPreviewProvider(null);
    this._boardsView?.setTrayPlaceability(null);
    this._boardsView?.setDragEnabled(true);
    this._boardsView?.setHammerWobble(null);
    if (this._unitBlockEntered) {
      this._unitBlockEntered = false;
      this._boardsView?.exitUnitBlockMode();
    }
    if (this._gridShakeTime !== null) {
      this._gridShakeTime = null;
      this._gridShakeAmplitude = 0;
      this._boardsView?.setGridShakeTransform(0, 0, 0);
    }
    this._unitBlockColor = null;
    this._trayRefreshInFlight = false;
    this._boardsView = null;
    this._config = null;
    this._gridsModel = null;
    this._gridEvents = null;
    this._ids = null;
    this._clearRule = null;
    this._gameState = null;
    this._scoreModel = null;
    this._comboModel = null;
    this._boosterPanel = null;
    this._placeabilityModel = null;
    this._particleManager = null;
    this._updateManager = null;
    this._trayEvents = null;
    super.destroy();
  }

  /**
   * Validity gate for both the drag-time ghost and the drop-time
   * commit. Delegates to {@link PiecePlacementOperations.canPlace};
   * after the view's clamp-into-bounds anchor, bounds are guaranteed
   * in, so the predicate reduces to "are all target cells empty?".
   */
  private _canPlace(footprint: readonly { col: number; row: number }[]): boolean {
    if (!this._gridsModel || !this._config) return false;
    const grid = this._gridsModel.getGrid(this._config.boardIds.grid);
    if (!grid) return false;
    return PiecePlacementOperations.canPlace(grid, footprint);
  }

  /**
   * Predictive clear-preview for the view's ghost. Runs the same
   * {@link LineClearRule.computeClears} the post-placement commit
   * uses, just with the candidate footprint treated as virtually
   * filled. So the highlight on the ghost exactly matches the
   * lines that will clear if the player drops here.
   */
  private _predictClears(footprint: readonly GridCoord[]): ClearPreviewResult {
    if (!this._gridsModel || !this._config || !this._clearRule) {
      return GameBoardsViewController._EMPTY_CLEAR_PREVIEW;
    }
    const grid = this._gridsModel.getGrid(this._config.boardIds.grid);
    if (!grid) return GameBoardsViewController._EMPTY_CLEAR_PREVIEW;
    return this._clearRule.computeClears(grid, footprint);
  }

  private static readonly _EMPTY_CLEAR_PREVIEW: ClearPreviewResult = {
    cells: [],
    fullRows: [],
    fullCols: [],
  };

  /**
   * Commit a valid drop. The view has already validated via the
   * predicate; we re-resolve the grids here from the model so we
   * mutate the source of truth, then run the placement op (creates
   * N grid items), remove the tray item (empties the slot), clear
   * any rows/columns that became full, and refill the tray if every
   * slot is now empty. Each mutation fires framework events that
   * the base controller turns into view updates.
   */
  private _onPiecePlacement(info: PiecePlacementInfo): void {
    if (!this._gridsModel || !this._config || !this._ids || !this._clearRule) return;
    const grid = this._gridsModel.getGrid(this._config.boardIds.grid) as RectGrid | undefined;
    const tray = this._gridsModel.getGrid(this._config.boardIds.tray) as RectGrid | undefined;
    if (!grid || !tray) return;
    PiecePlacementOperations.place(grid, info.footprint, info.item.pieceType, info.item.color, this._ids);
    tray.removeCellItem(info.trayCol, 0);
    // Score the placement: one award per cell of the piece's
    // footprint.
    this._scoreModel?.add(info.footprint.length * this._config.score.placedBlock);
    // Clear any full rows/columns. computeClears runs against the
    // post-placement grid state — placedCells already in the model,
    // so the overlay clause in `LineClearRule.computeClears` is
    // redundant here but harmless, and gives the same answer the
    // view's predictive preview reported.
    const clears = this._clearRule.computeClears(grid, info.footprint);
    for (const { col, row } of clears.cells) {
      grid.removeCellItem(col, row);
    }
    // Score the line clear: one award per full row + per full
    // column. A placement that completes both a row and a column at
    // once awards twice.
    const lineCount = clears.fullRows.length + clears.fullCols.length;
    if (lineCount > 0) {
      this._scoreModel?.add(lineCount * this._config.score.clearedLine);
    }
    // Combo streak: bump on any line clear, deplete one move on a
    // no-clear placement. The model handles the activate / extend /
    // deactivate state transitions; the HUD listens for changes.
    this._comboModel?.registerPlacement(lineCount > 0);
    // Booster panel charge: one stage per cleared row / column.
    // No-clear placements don't advance the bar (Charging keeps
    // its progress, Ready stays Ready).
    if (lineCount > 0) this._boosterPanel?.registerClear(lineCount);
    if (lineCount > 0) this._triggerGridShake(lineCount);
    if (GameBoardsViewController._isTrayEmpty(tray)) {
      PieceSpawnOperations.dealHand(tray, this._config.pieceTypes, this._config.rotatedShapes, this._config.blockColors, this._ids);
    }
  }

  /** True iff every tray slot is currently empty. Single-row tray,
   *  so we walk row 0 only. */
  private static _isTrayEmpty(tray: IBaseGrid): boolean {
    for (let col = 0; col < tray.columnCount; col++) {
      const cell = tray.getCell(col, 0);
      if (cell !== null && cell.size > 0) return false;
    }
    return true;
  }

  /**
   * Queue a recompute to run after the current synchronous
   * mutation chain completes. Multiple calls within the same
   * microtask collapse to a single recompute, so a commit
   * sequence (place → remove tray → clear lines → refill) only
   * triggers one game-over check, evaluated against the final
   * grid + tray state.
   */
  private _scheduleRecompute(): void {
    if (this._recomputePending) return;
    this._recomputePending = true;
    queueMicrotask(() => {
      this._recomputePending = false;
      this._recomputeTrayState();
    });
  }

  /**
   * Walk every occupied tray slot, ask
   * {@link PiecePlacementOperations.hasAnyValidPlacement} whether
   * its piece can still go anywhere on the playing grid, and push
   * the per-slot placeable / unplaceable map to the view. Fires
   * `GameState.GameOver` (and disables drag) the moment every
   * occupied slot is unplaceable.
   *
   * Scheduled via {@link _scheduleRecompute} once per synchronous
   * commit chain, so the view's faded state and the game-over gate
   * always reflect the **final** post-commit grid + tray contents.
   */
  private _recomputeTrayState(): void {
    if (!this._gridsModel || !this._config || !this._boardsView || !this._gameState) return;
    const grid = this._gridsModel.getGrid(this._config.boardIds.grid);
    const tray = this._gridsModel.getGrid(this._config.boardIds.tray);
    if (!grid || !tray) return;

    const placeability = new Map<number, boolean>();
    let anyOccupied = false;
    let anyPlaceable = false;
    for (let col = 0; col < tray.columnCount; col++) {
      const cell = tray.getCell(col, 0);
      const item = cell?.item;
      if (!(item instanceof GameBoardItem)) continue;
      anyOccupied = true;
      const placeable = PiecePlacementOperations.hasAnyValidPlacement(grid, item.cells);
      placeability.set(col, placeable);
      if (placeable) anyPlaceable = true;
    }

    const view: IGameBoardsView = this._boardsView;
    view.setTrayPlaceability(placeability satisfies TrayPlaceability);
    this._placeabilityModel?.setHasPlaceable(anyPlaceable);

    // Game-over rule: the tray must be locked AND the booster panel
    // must NOT be Ready / Selecting. Both Ready and Selecting give
    // the player a way to recover with a booster, so the HUD shows
    // the "NO MOVES LEFT, USE BOOSTER!" prompt and the game
    // continues until the player consumes the booster
    // (`onChange` re-fires this recompute) without unlocking the
    // tray.
    const boosterCharging = this._boosterPanel === null || this._boosterPanel.state === BoosterPanelState.Charging;
    const gameOver = anyOccupied && !anyPlaceable && boosterCharging;
    // Only fire GameOver from Playing — otherwise a no-moves
    // condition that hits while we're already in TimeUp would
    // overwrite the time-up label. Also skip while a Tray Refresh
    // is in flight: the recompute scheduled by the booster's
    // synchronous consume() runs before the new hand is dealt, so
    // the placeability map still reflects the (now-irrelevant) old
    // pieces. The post-deal recompute fires with the flag cleared
    // and evaluates against the new tray.
    if (gameOver && this._gameState.state === GameState.Playing && !this._trayRefreshInFlight) {
      this._gameState.setState(GameState.GameOver);
    }

    // Drag + cell-tap gates derived from the same state:
    // - Drag stays enabled during UnitBlock Selecting so the temp
    //   1-cell piece is draggable; only Hammer Selecting disables it
    //   (Hammer uses the cell-tap path instead).
    // - Cell-tap is enabled only while in Selecting + Hammer.
    // - Any terminal game state (TimeUp / GameOver) shuts both off
    //   so the player can't place blocks after the game ends. The
    //   view's `setDragEnabled(false)` also aborts any in-flight
    //   drag (e.g. countdown ran out mid-drag).
    const isSelecting =
      this._boosterPanel !== null && this._boosterPanel.state === BoosterPanelState.Selecting;
    const isHammerSelecting =
      isSelecting && this._boosterPanel?.selectedBooster === BoosterType.Hammer;
    const terminal = this._gameState.state !== GameState.Playing;
    view.setDragEnabled(!terminal && !gameOver && !isHammerSelecting);
    view.setCellTapEnabled(!terminal && isHammerSelecting);

    // Background dim: only while Selecting AND the pending booster
    // is a target-selection one. Tray Refresh consumes inline and
    // never reaches Selecting, so the check on `selectedBooster` is
    // belt-and-braces — keeps the rule explicit at the call site.
    const selected = this._boosterPanel?.selectedBooster ?? null;
    const dim =
      isSelecting && (selected === BoosterType.Hammer || selected === BoosterType.UnitBlock);
    const bg = dim ? this._config.backgroundColors.selecting : this._config.backgroundColors.default;
    view.setBackgroundGradient(bg.top, bg.bottom);

    // Unit Block placeability — mirrors the per-tray-slot fading
    // logic for the single temp piece. The 1-cell piece is
    // placeable as long as any grid cell is empty; the view's
    // `setUnitBlockPlaceable` no-ops outside Unit Block mode.
    if (this._unitBlockEntered) {
      const unitBlockPlaceable = PiecePlacementOperations.hasAnyValidPlacement(grid, [[0, 0]]);
      view.setUnitBlockPlaceable(unitBlockPlaceable);
    }
  }

  /**
   * Booster panel transition handler. Synchronously enters / exits
   * Unit Block mode (so the temp piece is in place before the
   * debounced recompute reads its placeability) and schedules the
   * tray-state recompute for the next microtask.
   */
  private _onBoosterPanelChange(): void {
    this._syncUnitBlockMode();
    this._scheduleRecompute();
  }

  /**
   * Enter / exit the Unit Block booster's drag mode in sync with
   * the booster panel state. Synchronously called from the booster
   * panel's `onChange` so the temp piece is in place before the
   * debounced `_recomputeTrayState` runs.
   */
  private _syncUnitBlockMode(): void {
    if (!this._boosterPanel || !this._boardsView || !this._config || !this._gridsModel) return;
    const shouldBeOn =
      this._boosterPanel.state === BoosterPanelState.Selecting &&
      this._boosterPanel.selectedBooster === BoosterType.UnitBlock;
    if (shouldBeOn && !this._unitBlockEntered) {
      const trayGrid = this._gridsModel.getGrid(this._config.boardIds.tray);
      if (!trayGrid) return;
      // tray.position = (-getCenterOffset() + layoutCenter), so the
      // tray's world centre is `tray.position + getCenterOffset()`.
      // Config offset shifts the unit block from that centre.
      const preset = trayGrid.preset as RectGridPreset;
      const centerOffset = preset.getCenterOffset();
      const trayPos = trayGrid.position;
      const offset = this._config.unitBlock.trayPositionOffset;
      const worldX = trayPos.x + centerOffset.x + offset.x;
      const worldZ = trayPos.z + centerOffset.z + offset.z;
      // Sample a colour from the regular palette so the temp piece
      // reads as a normal game block (not a special-case white).
      const palette = this._config.blockColors;
      const color = palette[Math.floor(Math.random() * palette.length)] ?? 0xffffff;
      this._unitBlockColor = color;
      this._boardsView.enterUnitBlockMode(color, worldX, worldZ);
      this._unitBlockEntered = true;
    } else if (!shouldBeOn && this._unitBlockEntered) {
      this._unitBlockEntered = false;
      this._unitBlockColor = null;
      this._boardsView.exitUnitBlockMode();
    }
  }

  /**
   * Commit a Unit Block drop on a valid empty grid cell — same
   * post-placement pipeline as a normal piece (score / clears /
   * combo / charge), minus the tray-slot removal. The booster is
   * consumed last so the view's recompute reads the post-consume
   * state when it runs.
   */
  private _handleUnitBlockPlacement(footprint: readonly GridCoord[]): void {
    if (!this._gridsModel || !this._config || !this._ids || !this._clearRule || !this._boosterPanel) return;
    const grid = this._gridsModel.getGrid(this._config.boardIds.grid) as RectGrid | undefined;
    if (!grid) return;
    // `_unitBlockColor` is set on Selecting entry; if it's somehow
    // unset by the time the drop fires, fall back to a palette pick.
    const palette = this._config.blockColors;
    const color = this._unitBlockColor ?? palette[Math.floor(Math.random() * palette.length)] ?? 0xffffff;
    PiecePlacementOperations.place(
      grid,
      footprint,
      GameBoardsViewController.UNIT_BLOCK_PIECE_TYPE,
      color,
      this._ids,
    );
    this._scoreModel?.add(footprint.length * this._config.score.placedBlock);
    const clears = this._clearRule.computeClears(grid, footprint);
    for (const { col, row } of clears.cells) grid.removeCellItem(col, row);
    const lineCount = clears.fullRows.length + clears.fullCols.length;
    if (lineCount > 0) {
      this._scoreModel?.add(lineCount * this._config.score.clearedLine);
    }
    this._comboModel?.registerPlacement(lineCount > 0);
    // Consume FIRST so the booster panel is Charging when
    // `registerClear` runs — the model is no-op during Selecting.
    this._boosterPanel.consume();
    if (lineCount > 0) this._boosterPanel.registerClear(lineCount);
    if (lineCount > 0) this._triggerGridShake(lineCount);
  }

  /**
   * Grid cell taps only matter during a Hammer target selection.
   * On a filled cell: spawn a coloured destruction burst at the
   * cell's world position (particles inherit the block's colour),
   * empty it, then consume the booster. On an empty cell: ignore
   * (Selecting state stays — player can try again or cancel).
   */
  private _handleGridCellTap(col: number, row: number): void {
    if (!this._boosterPanel || !this._gridsModel || !this._config) return;
    if (this._boosterPanel.state !== BoosterPanelState.Selecting) return;
    if (this._boosterPanel.selectedBooster !== BoosterType.Hammer) return;

    const grid = this._gridsModel.getGrid(this._config.boardIds.grid) as RectGrid | undefined;
    if (!grid) return;
    const cell = grid.getCellSafe(col, row);
    if (cell === null || cell.size === 0) return;

    // Read the destroyed block's colour off the model *before* the
    // remove call — `removeCellItem` drops the item and the view
    // disposes its visuals, so the colour would be unreadable by
    // the time we ask afterward.
    const item = cell.item;
    if (item instanceof GameBoardItem && this._boardsView) {
      this._boardsView.emitHammerBurst(col, row, item.color);
    }

    grid.removeCellItem(col, row);
    this._boosterPanel.consume();
  }

  /**
   * Per-frame Hammer wobble pacer. While the booster panel is in
   * Selecting with Hammer pending, accumulate time and push the
   * sample into the view. On the transition out of that state, push
   * `null` once so the view snaps every block back to rest, then
   * skip the per-frame work.
   */
  /**
   * Tray Refresh orchestration. The HUD controller has already
   * consumed the booster; here we slide the current pieces out,
   * then clear the model cells, then deal a fresh hand (which auto-
   * starts the entry slide via the view's `createItem` hook).
   * Same `dealHand` contract as the post-placement refill — the
   * never-K-of-a-kind constraint applies.
   */
  private _onTrayRefreshRequested(): void {
    if (!this._boardsView || !this._gridsModel || !this._config || !this._ids) return;
    const tray = this._gridsModel.getGrid(this._config.boardIds.tray) as RectGrid | undefined;
    if (!tray) return;
    // Mark in-flight before kicking the exit animation. The micro-
    // task recompute queued by the booster's already-fired
    // `consume()` (state went Ready → Charging) sees this flag and
    // skips the game-over check, so the stale old-tray placeability
    // doesn't end the game. Flag clears in the deal callback so the
    // post-`addCellItem` recompute runs the check against the new
    // hand.
    this._trayRefreshInFlight = true;
    this._boardsView.beginTrayExit(() => {
      for (let col = 0; col < tray.columnCount; col++) {
        while ((tray.getCell(col, 0)?.size ?? 0) > 0) {
          tray.removeCellItem(col, 0);
        }
      }
      PieceSpawnOperations.dealHand(
        tray,
        this._config!.pieceTypes,
        this._config!.rotatedShapes,
        this._config!.blockColors,
        this._ids!,
      );
      this._trayRefreshInFlight = false;
    });
  }

  private _onTick(dt: number): void {
    this._tickHammerWobble(dt);
    this._tickGridShake(dt);
    this._boardsView?.tickTrayAnimations(dt);
  }

  private _tickHammerWobble(dt: number): void {
    const isHammerSelecting =
      this._boosterPanel !== null &&
      this._boosterPanel.state === BoosterPanelState.Selecting &&
      this._boosterPanel.selectedBooster === BoosterType.Hammer;

    if (!isHammerSelecting) {
      if (this._wobbleActive) {
        this._wobbleActive = false;
        this._wobbleTime = 0;
        this._boardsView?.setHammerWobble(null);
      }
      return;
    }

    if (!this._wobbleActive) {
      this._wobbleActive = true;
      this._wobbleTime = 0;
    }
    this._wobbleTime += dt;
    this._boardsView?.setHammerWobble(this._wobbleTime);
  }

  /**
   * Capture the impact-shake amplitude for a placement that cleared
   * `lineCount` lines. Amplitude scales linearly with extra lines
   * via `gridShake.amplitudeLineScale` (single-line clears use the
   * base amplitude unchanged).
   */
  private _triggerGridShake(lineCount: number): void {
    if (!this._config) return;
    const cfg = this._config.gridShake;
    const scaled = cfg.amplitude * (1 + cfg.amplitudeLineScale * Math.max(0, lineCount - 1));
    this._gridShakeAmplitude = scaled;
    this._gridShakeTime = 0;
  }

  /**
   * Trauma-style impact shake. Each frame, independent random
   * offsets on X and Z (and a small random Y-axis rotation) are
   * applied, all scaled by `(1 - t/duration)^decayPower` so the
   * shake reads as a sudden jolt that settles — not a controlled
   * sinusoid. Random per-frame direction prevents the eye from
   * locking onto a wobble period.
   */
  private _tickGridShake(dt: number): void {
    if (this._gridShakeTime === null || this._config === null || this._boardsView === null) return;
    const cfg = this._config.gridShake;
    this._gridShakeTime += dt;
    if (this._gridShakeTime >= cfg.durationSeconds) {
      this._gridShakeTime = null;
      this._gridShakeAmplitude = 0;
      this._boardsView.setGridShakeTransform(0, 0, 0);
      return;
    }
    const trauma = 1 - this._gridShakeTime / cfg.durationSeconds;
    const decay = Math.pow(trauma, cfg.decayPower);
    const ampOffset = this._gridShakeAmplitude * decay;
    const ampRotRad = ((cfg.rotationAmplitudeDegrees * Math.PI) / 180) * decay;
    const offsetX = (Math.random() * 2 - 1) * ampOffset;
    const offsetZ = (Math.random() * 2 - 1) * ampOffset;
    const rotationY = (Math.random() * 2 - 1) * ampRotRad;
    this._boardsView.setGridShakeTransform(offsetX, offsetZ, rotationY);
  }
}
