import type { IGridItem, IGridView, IInstanceResolver, IRectGrid } from "@gamebyte/gamelabsjs";
import { GridsViewController } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import { Match3AssetIds } from "../../../Match3AssetIds.js";
import { IGameModel } from "../../../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../../../models/IGameModel.js";
import { GameBoardItem } from "../models/GameBoardItem.js";
import { GameOperations } from "../../../utilities/GameOperations.js";
import { GameEvents } from "../../../events/GameEvents.js";
import { GameBoardItemObjectOptions } from "../views/GameBoardItemObjectOptions.js";
import type { IGameBoardsView } from "../views/IGameBoardsView.js";

export class GameBoardsViewController extends GridsViewController {
  private _gameModel: IGameModelType | null = null;
  private _operations: GameOperations | null = null;
  private _config: Match3Config | null = null;
  private _gameEvents: GameEvents | null = null;
  private _gridsView: IGameBoardsView | null = null;
  private _selected: { col: number; row: number } | null = null;
  /**
   * Cells whose gems are mid-pop, i.e. already claimed by a chain but not yet
   * cleared from the model. Reserved per CELL, not per column: a column-wide claim
   * made any match sharing a column with a running chain wait its turn, which is
   * exactly the queueing this avoids.
   *
   * Nothing else needs reserving. Gravity and refill are model-first — the grid is
   * updated before their animations start — so a gem that is still visually falling
   * already sits at its final cell as far as the model is concerned, and a new
   * chain may claim it. The view cancels the stale tween on the way in.
   */
  private readonly _claimedCells = new Set<string>();
  /**
   * Cells whose gem is mid-flight — falling into a gap or dropping in from above.
   * Blocks PLAYER input only, deliberately not {@link _settle}: a gem in the air is
   * not something you can grab, but the board is free to keep resolving cascades
   * through it, which is what keeps chains independent of one another.
   */
  private readonly _animatingCells = new Set<string>();
  /** Cell + screen position of the press in flight, used to classify tap vs swipe. */
  private _press: { gridId: number; col: number; row: number; x: number; y: number } | null = null;
  private readonly _onPointerUp = (e: PointerEvent): void => this._handlePointerUp(e);
  private readonly _onPointerCancel = (): void => {
    this._press = null;
  };

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._gameModel = resolver.getInstance(IGameModel);
    this._operations = resolver.getInstance(GameOperations);
    this._config = resolver.getInstance(Match3Config);
    this._gameEvents = resolver.getInstance(GameEvents);
  }

  public override initialize(view: IGridView): void {
    super.initialize(view);
    this._gridsView = view as IGameBoardsView;
    this._gridsView.setCellPointerDownHandler((gridId, col, row, event) => this._onGridCellPointerDown(gridId, col, row, event));
    // Release is read on `window`, not on the cell: a swipe usually ends over a
    // different cell — or off the board entirely — and the press still has to be
    // resolved. Passive because nothing here calls preventDefault.
    window.addEventListener("pointerup", this._onPointerUp, { passive: true });
    window.addEventListener("pointercancel", this._onPointerCancel, { passive: true });
  }

  protected override createItemObjectOption(item: IGridItem, grid: IRectGrid): GameBoardItemObjectOptions {
    if (!(item instanceof GameBoardItem)) throw new Error("Expected GameBoardItem");
    const shadow = this._config?.gemShadow ?? new Match3Config().gemShadow;
    return new GameBoardItemObjectOptions(item.itemId, grid.preset, item.gemType, shadow);
  }

  /**
   * A press only records where it started. Whether it turns into a selection or a
   * swipe is decided on release, in {@link _handlePointerUp} — the two can only be
   * told apart once the pointer has stopped moving.
   */
  private _onGridCellPointerDown(gridId: number, col: number, row: number, event: PointerEvent): void {
    if (gridId !== Match3Config.GRID_ID || this._isCellBusy(row, col)) return;
    this._press = { gridId, col, row, x: event.clientX, y: event.clientY };
  }

  private _handlePointerUp(event: PointerEvent): void {
    const press = this._press;
    const cfg = this._config;
    this._press = null;
    if (!press || !cfg) return;

    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    const min = cfg.swipeMinDistancePx;

    if (Math.abs(dx) >= min || Math.abs(dy) >= min) {
      void this._handleSwipeAsync(press.gridId, press.col, press.row, dx, dy);
      return;
    }
    void this._handleTapAsync(press.gridId, press.col, press.row);
  }

  /**
   * Swipe: swap with the neighbour along the dominant drag axis. The board is
   * drawn by an unrotated top-down camera, so screen axes map straight onto grid
   * axes — right is +col, down is +row (the same +Z-is-down convention the gravity
   * code uses).
   */
  private async _handleSwipeAsync(gridId: number, col: number, row: number, dx: number, dy: number): Promise<void> {
    const cfg = this._config;
    if (!cfg) return;

    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const targetCol = col + (horizontal ? Math.sign(dx) : 0);
    const targetRow = row + (horizontal ? 0 : Math.sign(dy));
    // Swiping off the edge of the board is a no-op rather than a wrong-move buzz.
    if (targetCol < 0 || targetCol >= cfg.cols || targetRow < 0 || targetRow >= cfg.rows) return;

    this._clearSelection(gridId);
    await this._trySwapAsync(gridId, row, col, targetRow, targetCol);
  }

  /** Tap: first tap selects, tapping the same gem deselects, tapping a neighbour swaps. */
  private async _handleTapAsync(gridId: number, col: number, row: number): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    const events = this._gameEvents;
    if (!svc || !view || !events || this._isCellBusy(row, col)) return;

    if (this._selected === null) {
      this._selected = { col, row };
      view.updateGemSelection(gridId, this._selected);
      events.emitPlaySfx(Match3AssetIds.SfxSelect);
      return;
    }

    if (this._selected.col === col && this._selected.row === row) {
      this._clearSelection(gridId);
      return;
    }

    const r0 = this._selected.row;
    const c0 = this._selected.col;
    if (svc.isAdjacent(r0, c0, row, col)) {
      this._clearSelection(gridId);
      await this._trySwapAsync(gridId, r0, c0, row, col);
      return;
    }

    this._selected = { col, row };
    view.updateGemSelection(gridId, this._selected);
  }

  /**
   * The single entry point for a swap attempt — both tap and swipe funnel through
   * here, so anything that reacts to a swap (special gems from 4/5-length matches,
   * move counters, boosters) has one place to hook.
   */
  private async _trySwapAsync(gridId: number, r0: number, c0: number, r1: number, c1: number): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    const events = this._gameEvents;
    if (!svc || !view || !events) return;
    if (!svc.isAdjacent(r0, c0, r1, c1)) return;
    const k0 = this._cellKey(r0, c0);
    const k1 = this._cellKey(r1, c1);
    if (this._isCellBusy(r0, c0) || this._isCellBusy(r1, c1)) return;

    // Hold just these two cells for the swap tween. Every other cell stays playable,
    // and the chain started below claims only the cells it actually pops.
    this._claimedCells.add(k0);
    this._claimedCells.add(k1);
    try {
      if (!svc.peekSwapCreatesMatch(r0, c0, r1, c1)) {
        events.emitPlaySfx(Match3AssetIds.SfxWrong);
        await view.animateInvalidSwap(gridId, r0, c0, r1, c1);
        return;
      }
      events.emitPlaySfx(Match3AssetIds.SfxSwap);
      await view.animateValidSwap(gridId, r0, c0, r1, c1);
      svc.applySwap(r0, c0, r1, c1);
    } finally {
      this._claimedCells.delete(k0);
      this._claimedCells.delete(k1);
    }

    // Starts this match's chain straight away — it claims its columns before its
    // first await, so the pop begins now rather than behind another chain's phase.
    this._settle(gridId);
  }

  private _clearSelection(gridId: number): void {
    this._selected = null;
    this._gridsView?.updateGemSelection(gridId, null);
  }

  /**
   * Starts a chain for every match currently on the board whose columns are all
   * free. Each chain runs on its own, so a new match pops the moment it is made
   * instead of waiting for another chain's phase to finish.
   *
   * Called after a swap and after every chain step, so no match is ever left
   * unresolved: one blocked by a busy column is simply picked up by the next call.
   */
  private _settle(gridId: number): void {
    const svc = this._operations;
    if (!svc) return;

    for (const cluster of this._matchClusters(svc.findMatches())) {
      if (cluster.some((c) => this._claimedCells.has(this._cellKey(c.row, c.col)))) continue;
      // Claimed synchronously, before the chain's first await, so two settle calls
      // can never hand the same cells to two chains.
      for (const c of cluster) this._claimedCells.add(this._cellKey(c.row, c.col));
      void this._runChainAsync(gridId, cluster);
    }
  }

  /** Off limits to the player: mid-pop (claimed by a chain) or still in the air. */
  private _isCellBusy(row: number, col: number): boolean {
    const key = this._cellKey(row, col);
    return this._claimedCells.has(key) || this._animatingCells.has(key);
  }

  private _cellKey(row: number, col: number): string {
    return `${row},${col}`;
  }

  /**
   * Resolves one match and whatever falls out of it: pop → clear → gravity →
   * refill, all scoped to `cols`, then hands the board back to {@link _settle} so a
   * follow-up match in these columns becomes a fresh chain rather than a loop that
   * keeps the columns hostage.
   */
  private async _runChainAsync(gridId: number, cells: { row: number; col: number }[]): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    const events = this._gameEvents;
    const release = (): void => {
      for (const c of cells) this._claimedCells.delete(this._cellKey(c.row, c.col));
    };
    if (!svc || !view || !events) {
      release();
      return;
    }

    // A gem the player had selected may be about to vanish under it.
    if (this._selected && cells.some((c) => c.row === this._selected!.row && c.col === this._selected!.col)) {
      this._clearSelection(gridId);
    }

    const cols = new Set(cells.map((c) => c.col));
    try {
      events.emitPlaySfx(Match3AssetIds.SfxPop);
      // NOT awaited. The view detaches these gems from their cells, so the pop plays
      // on its own and the drop below can start at once — awaiting it here is what
      // used to stall the fall behind the full pop duration.
      void view.animateClearMatches(gridId, cells);
      svc.clearMatchedCells(cells);
      events.emitScoreChanged(this._gameModel!.score);
    } finally {
      // Released as soon as the model no longer holds these gems — from here on the
      // cells are fair game for another chain even while the fall is still playing.
      release();
    }

    // Gravity and refill are applied to the model back to back, then animated
    // together: the surviving gems slide down while the new ones enter from above,
    // so a column always moves as one stack. Awaiting the fall before spawning made
    // the board visibly wait with a gap at the top before anything came in.
    const moves = svc.applyGravity(cols);
    const spawns = svc.refillEmpty(cols);

    // Their destination cells hold the gems that are now in the air, so input stays
    // off them until they land.
    const inFlight = [
      ...moves.map((m) => this._cellKey(m.toRow, m.toCol)),
      ...spawns.map((s) => this._cellKey(s.row, s.col))
    ];
    for (const k of inFlight) this._animatingCells.add(k);
    try {
      await Promise.all([view.animateGravityMoves(gridId, moves), view.animateRefillSpawns(gridId, spawns)]);
    } finally {
      for (const k of inFlight) this._animatingCells.delete(k);
    }
    events.emitScoreChanged(this._gameModel!.score);

    this._settle(gridId);
  }

  /**
   * `findMatches()` returns a flat cell list, so runs that happen to share the
   * board are indistinguishable from one another. Grouping the cells into
   * 4-connected clusters recovers the individual explosions, which is what lets
   * two unrelated matches resolve at the same time.
   */
  private _matchClusters(cells: { row: number; col: number }[]): { row: number; col: number }[][] {
    const key = (r: number, c: number): string => `${r},${c}`;
    const remaining = new Map(cells.map((c) => [key(c.row, c.col), c]));
    const clusters: { row: number; col: number }[][] = [];

    for (const startKey of [...remaining.keys()]) {
      const start = remaining.get(startKey);
      if (!start) continue;
      remaining.delete(startKey);

      const cluster = [start];
      const queue = [start];
      while (queue.length > 0) {
        const { row, col } = queue.pop()!;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const k = key(row + dr, col + dc);
          const neighbour = remaining.get(k);
          if (!neighbour) continue;
          remaining.delete(k);
          cluster.push(neighbour);
          queue.push(neighbour);
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  public override destroy(): void {
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerCancel);
    this._press = null;
    this._gridsView?.setCellPointerDownHandler(null);
    this._gridsView = null;
    this._gameModel = null;
    this._operations = null;
    this._config = null;
    this._gameEvents = null;
    this._selected = null;
    super.destroy();
  }
}
