import type { IGridItem, IGridView, IInstanceResolver, IRectGrid } from "@gamebyte/gamelabsjs";
import { CameraShakeTrack, GameCameraManager, GridsViewController, TimelineManager } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import { Match3AssetIds } from "../../../Match3AssetIds.js";
import { IGameModel } from "../../../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../../../models/IGameModel.js";
import { GameBoardItem, GemSpecial } from "../models/GameBoardItem.js";
import { GameOperations, type Cell, type MatchRun } from "../../../utilities/GameOperations.js";
import { GameEvents } from "../../../events/GameEvents.js";
import { GameBoardItemObjectOptions } from "../views/GameBoardItemObjectOptions.js";
import type { IGameBoardsView } from "../views/IGameBoardsView.js";

/** A special gem a match earned: what to create, and in which cell. */
type SpecialSpawn = { row: number; col: number; gemType: number; special: GemSpecial };

export class GameBoardsViewController extends GridsViewController {
  private _gameModel: IGameModelType | null = null;
  private _operations: GameOperations | null = null;
  private _config: Match3Config | null = null;
  private _gameEvents: GameEvents | null = null;
  private _gridsView: IGameBoardsView | null = null;
  private _timeline: TimelineManager | null = null;
  private _camera: GameCameraManager | null = null;
  /**
   * The selected gem, held by IDENTITY as well as position. A cascade can shift a
   * column under a standing selection, leaving a different gem in the same cell — by
   * coordinates alone the next tap would swap a gem the player never picked.
   */
  private _selected: { col: number; row: number; itemId: number } | null = null;
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
   *
   * Blocks player input AND match resolution. The model counts a gem as arrived the
   * instant it is assigned a cell, so without this a match would fire on gems that
   * are still visually descending from the reserve — the board acting on items that
   * have not landed yet. Those matches are not lost: every chain calls {@link _settle}
   * again once its animation finishes, which is when they legitimately fire.
   *
   * Chains stay independent regardless, because this only covers the cells actually
   * in motion — anything at rest elsewhere on the board resolves immediately.
   */
  private readonly _animatingCells = new Set<string>();
  /**
   * The two cells of the swap that is resolving. A special earned by that move
   * lands on whichever of them is part of the match, so the reward appears under
   * the player's finger rather than in the middle of the run.
   */
  private _lastSwap: readonly Cell[] | null = null;
  /**
   * How many pops deep the current cascade is — drives the rising pop pitch. Chains
   * that overlap share the ladder, so a busy board keeps climbing rather than each
   * chain restarting at the base note.
   */
  private _comboStep = 0;
  /** Chains in flight. The pitch ladder resets when this falls back to zero. */
  private _activeChains = 0;
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
    this._timeline = resolver.getInstance(TimelineManager);
    this._camera = resolver.getInstance(GameCameraManager);
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
    const cfg = this._config ?? new Match3Config();
    return new GameBoardItemObjectOptions(item.itemId, grid.preset, item.gemType, cfg.gemShadow, item.special, cfg.special);
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
    // Rows are absolute grid coordinates, so the limits are the playable window —
    // everything above `firstVisibleRow` is reserve the player cannot reach.
    if (targetCol < 0 || targetCol >= cfg.cols) return;
    if (targetRow < cfg.firstVisibleRow || targetRow > cfg.lastVisibleRow) return;

    this._clearSelection(gridId);
    await this._trySwapAsync(gridId, row, col, targetRow, targetCol);
  }

  /** Tap: first tap selects, tapping the same gem deselects, tapping a neighbour swaps. */
  private async _handleTapAsync(gridId: number, col: number, row: number): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    const events = this._gameEvents;
    if (!svc || !view || !events || this._isCellBusy(row, col)) return;

    // Stale if the gem that was picked has since moved on or been cleared.
    if (this._selected && svc.itemIdAt(this._selected.row, this._selected.col) !== this._selected.itemId) {
      this._clearSelection(gridId);
    }

    if (this._selected === null) {
      this._selected = { col, row, itemId: svc.itemIdAt(row, col) };
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

    this._selected = { col, row, itemId: svc.itemIdAt(row, col) };
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

    // A cookie ignores the match rule entirely: trading it with any gem detonates it
    // on that gem's colour, so the swap is always legal. Read before the swap, since
    // applying it moves both gems.
    const bombFirst = svc.specialAt(r0, c0) === GemSpecial.ColorBomb;
    const bombSecond = svc.specialAt(r1, c1) === GemSpecial.ColorBomb;
    const cookieSwap = bombFirst || bombSecond;
    const partnerType = bombFirst ? svc.gemTypeAt(r1, c1) : svc.gemTypeAt(r0, c0);

    // Hold just these two cells for the swap tween. Every other cell stays playable,
    // and the chain started below claims only the cells it actually pops.
    this._claimedCells.add(k0);
    this._claimedCells.add(k1);
    try {
      if (!cookieSwap && !svc.peekSwapCreatesMatch(r0, c0, r1, c1)) {
        events.emitPlaySfx(Match3AssetIds.SfxWrong);
        await view.animateInvalidSwap(gridId, r0, c0, r1, c1);
        return;
      }
      events.emitPlaySfx(Match3AssetIds.SfxSwap);
      await view.animateValidSwap(gridId, r0, c0, r1, c1);
      svc.applySwap(r0, c0, r1, c1);
      this._lastSwap = [
        { row: r0, col: c0 },
        { row: r1, col: c1 }
      ];
    } finally {
      this._claimedCells.delete(k0);
      this._claimedCells.delete(k1);
    }

    if (cookieSwap) {
      // The cookie has traded places, so it now sits where its partner was. Detonate
      // it there on the partner's colour; `_settle` would not find it, since a cookie
      // swap makes no match of its own.
      this._detonateCookie(gridId, bombFirst ? { row: r1, col: c1 } : { row: r0, col: c0 }, partnerType);
    }

    // Starts this match's chain straight away — it claims its cells before its first
    // await, so the pop begins now rather than behind another chain's phase.
    this._settle(gridId);
    // Consumed: any later cascade match is not this player's move, and should place
    // its special by run position rather than at a stale swap cell.
    this._lastSwap = null;
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
    const cfg = this._config;
    if (!svc || !cfg) return;

    for (const group of this._runGroups(svc.findMatchRuns())) {
      // A striped gem caught in the match fires too, and whatever its sweep catches
      // joins the same clear — resolved before claiming so the chain owns every cell
      // it is about to touch.
      const cells = svc.expandSpecialClears(group.flatMap((run) => [...run.cells]));
      // A match is only real once every gem in it has landed.
      if (cells.some((c) => this._isCellBusy(c.row, c.col))) continue;
      // Claimed synchronously, before the chain's first await, so two settle calls
      // can never hand the same cells to two chains.
      for (const c of cells) this._claimedCells.add(this._cellKey(c.row, c.col));
      void this._runChainAsync(gridId, cells, this._planSpecial(group, cfg));
    }
  }

  /**
   * Fires a cookie that a swap set off, on the colour of the gem it traded with.
   *
   * Goes straight to a chain rather than through {@link _settle}: the swap produced no
   * match, so there is nothing for the match finder to pick up. The expansion still
   * runs, so a stripe caught in the blast fires as well.
   */
  private _detonateCookie(gridId: number, at: Cell, gemType: number): void {
    const svc = this._operations;
    if (!svc) return;

    const named = new Map<string, number>([[this._cellKey(at.row, at.col), gemType]]);
    const cells = svc.expandSpecialClears([at], named);
    if (cells.some((c) => this._claimedCells.has(this._cellKey(c.row, c.col)))) return;
    for (const c of cells) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, cells);
  }

  /**
   * Which special, if any, this match leaves behind — and where. The longest run in
   * the group decides: at `minRunLength` or more it becomes a striped gem sweeping
   * along that run's axis (or across it, per `special.alongMatch`).
   *
   * It lands on the cell the player just swapped when that cell is part of the match,
   * which is what makes the reward feel earned; a match born from a cascade has no
   * such cell, so it takes the middle of the run.
   */
  private _planSpecial(group: MatchRun[], cfg: Match3Config): SpecialSpawn | null {
    if (!cfg.special.enabled) return null;

    const longest = group.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    if (longest.cells.length < cfg.special.minRunLength) return null;

    const alongRow = cfg.special.alongMatch ? longest.orientation === "row" : longest.orientation === "column";
    const kind =
      longest.cells.length >= cfg.special.minCookieRunLength
        ? GemSpecial.ColorBomb
        : alongRow
          ? GemSpecial.StripedRow
          : GemSpecial.StripedColumn;
    const swapped = this._lastSwap?.find((c) => longest.cells.some((rc) => rc.row === c.row && rc.col === c.col));
    const at = swapped ?? longest.cells[Math.floor(longest.cells.length / 2)];

    return { row: at.row, col: at.col, gemType: longest.gemType, special: kind };
  }

  /**
   * Runs that share a cell belong to the same match — an L or a T is two runs
   * crossing, and they must clear together rather than as two independent chains.
   */
  private _runGroups(runs: MatchRun[]): MatchRun[][] {
    const groups: MatchRun[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < runs.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      const group = [runs[i]];
      const cells = new Set(runs[i].cells.map((c) => this._cellKey(c.row, c.col)));

      let grew = true;
      while (grew) {
        grew = false;
        for (let j = 0; j < runs.length; j++) {
          if (used.has(j)) continue;
          if (!runs[j].cells.some((c) => cells.has(this._cellKey(c.row, c.col)))) continue;
          used.add(j);
          group.push(runs[j]);
          for (const c of runs[j].cells) cells.add(this._cellKey(c.row, c.col));
          grew = true;
        }
      }
      groups.push(group);
    }
    return groups;
  }

  /** Off limits to the player: mid-pop (claimed by a chain) or still in the air. */
  private _isCellBusy(row: number, col: number): boolean {
    const key = this._cellKey(row, col);
    return this._claimedCells.has(key) || this._animatingCells.has(key);
  }

  /**
   * Punctuates a clear that is big enough to deserve it — a long sweep, or a chunky
   * cascade step. Runs as a `CameraShakeTrack` so the framework owns its lifetime and
   * cancels it cleanly; overlapping clears each get their own track and stack.
   */
  private _shakeIfBig(clearedCount: number): void {
    const cfg = this._config;
    if (!cfg || !this._timeline || !this._camera) return;
    if (cfg.shake.minCells <= 0 || clearedCount < cfg.shake.minCells) return;

    this._timeline.add(
      new CameraShakeTrack(this._camera, { amplitude: cfg.shake.amplitude, duration: cfg.shake.duration })
    );
  }

  private _cellKey(row: number, col: number): string {
    return `${row},${col}`;
  }

  /**
   * Resolves one match and whatever falls out of it: pop → clear → gravity →
   * refill over the whole board, then hands it back to {@link _settle} so a
   * follow-up match in these columns becomes a fresh chain rather than a loop that
   * keeps the columns hostage.
   */
  /** One step up the pop ladder, clamped so a long cascade holds at the top note. */
  private _nextPopRate(): number {
    const cfg = this._config;
    if (!cfg) return 1;
    const step = Math.min(this._comboStep, cfg.popPitch.maxSteps);
    this._comboStep++;
    return 1 + step * cfg.popPitch.step;
  }

  private async _runChainAsync(gridId: number, cells: { row: number; col: number }[], special: SpecialSpawn | null = null): Promise<void> {
    this._activeChains++;
    try {
      await this._runChainBodyAsync(gridId, cells, special);
    } finally {
      this._activeChains--;
      // Quiet board: the next move starts from the base note again.
      if (this._activeChains === 0) this._comboStep = 0;
    }
  }

  private async _runChainBodyAsync(gridId: number, cells: { row: number; col: number }[], special: SpecialSpawn | null = null): Promise<void> {
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

    const allCols = new Set(Array.from({ length: svc.cols }, (_, i) => i));
    try {
      events.emitPlaySfx(Match3AssetIds.SfxPop, this._nextPopRate());
      this._shakeIfBig(cells.length);
      // NOT awaited. The view detaches these gems from their cells, so the pop plays
      // on its own and the drop below can start at once — awaiting it here is what
      // used to stall the fall behind the full pop duration.
      void view.animateClearMatches(gridId, cells);
      svc.clearMatchedCells(cells);
      // Placed before gravity runs, so the cell counts as filled and nothing drops
      // into it — the special stays where the match earned it.
      if (special) svc.createSpecial(special.row, special.col, special.gemType, special.special);
      events.emitScoreChanged(this._gameModel!.score);
      events.emitGoalChanged(this._gameModel!.cleared, this._config!.goal);
    } finally {
      // Released as soon as the model no longer holds these gems — from here on the
      // cells are fair game for another chain even while the fall is still playing.
      release();
    }

    // Gravity and refill are applied to the model back to back, then animated
    // together: the surviving gems slide down while the new ones enter from above,
    // so a column always moves as one stack. Awaiting the fall before spawning made
    // the board visibly wait with a gap at the top before anything came in.
    // Read the gems' real positions BEFORE the model moves them — the grid rebuilds a
    // gem's object on every cell change, which otherwise loses where it was and makes
    // the drop restart from the old cell instead of continuing.
    // Whole board, not just this chain's columns. Scoping these to `cols` meant a gap
    // in a column no chain happened to name was never compacted — a gem left hanging
    // with empty cells under it, and a special that would not fall. The board is 8x8;
    // compacting all of it costs nothing and makes that state unreachable.
    const captured = view.captureGemPositions(gridId, allCols);
    const moves = svc.applyGravity();
    const spawns = svc.refillEmpty();

    // Their destination cells hold the gems that are now in the air, so input stays
    // off them until they land.
    const inFlight = [
      ...moves.map((m) => this._cellKey(m.toRow, m.toCol)),
      ...spawns.map((s) => this._cellKey(s.row, s.col))
    ];
    for (const k of inFlight) this._animatingCells.add(k);
    try {
      await view.reconcileColumns(gridId, allCols, captured);
    } finally {
      for (const k of inFlight) this._animatingCells.delete(k);
    }
    events.emitScoreChanged(this._gameModel!.score);
      events.emitGoalChanged(this._gameModel!.cleared, this._config!.goal);

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
