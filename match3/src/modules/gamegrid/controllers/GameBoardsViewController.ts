import type { IGridItem, IGridView, IInstanceResolver, IRectGrid } from "@gamebyte/gamelabsjs";
import { CameraShakeTrack, GameCameraManager, GridsViewController, TimelineManager } from "@gamebyte/gamelabsjs";
import { Match3Config } from "../../../Match3Config.js";
import { Match3AssetIds } from "../../../Match3AssetIds.js";
import { IGameModel } from "../../../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../../../models/IGameModel.js";
import { GameBoardItem, GemSpecial } from "../models/GameBoardItem.js";
import { GameOperations, type Cell, type MatchRun, type SweepCell } from "../../../utilities/GameOperations.js";
import { GameEvents } from "../../../events/GameEvents.js";
import { GameBoardItemObjectOptions } from "../views/GameBoardItemObjectOptions.js";
import type { IGameBoardsView } from "../views/IGameBoardsView.js";

/** A special gem a match earned: what to create, and in which cell. */
type SpecialSpawn = { row: number; col: number; gemType: number; special: GemSpecial };

/**
 * A cookie going off, and the gems it is taking — one bolt drawn per target.
 *
 * `wave` ties the volley to a step of the clear: those bolts are thrown when the sweep
 * reaches that step and the gems go as they land, so the effect travels with the clear
 * instead of alongside it. Without it the whole volley is thrown once, before the clear.
 */
type CookieBolt = { from: Cell; targets: Cell[]; wave?: number };

/**
 * How one clear is timed: the gap between its steps, and how long its bolts fly.
 * Combinations pass their own (see `Match3Config.combos`); everything else takes the
 * shared values.
 */
type ClearPace = { stepSec: number; beamSec: number };

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
   * Boosters that were lit while their surroundings were still in motion. The match
   * that lit them is long gone, so nothing else would ever set them off — this list is
   * what remembers to, once the board around them has filled in.
   */
  private readonly _pendingBoosters = new Set<number>();
  /** Gems converted by a cookie+booster combo, pulsing until their turn to go off. */
  private readonly _comboQueue = new Set<number>();
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
    return new GameBoardItemObjectOptions(item.itemId, grid.preset, item.gemType, cfg.gemShadow, item.special, cfg.special, cfg.booster, cfg.giant.spanCells);
  }

  /**
   * A press only records where it started. Whether it turns into a selection or a
   * swipe is decided on release, in {@link _handlePointerUp} — the two can only be
   * told apart once the pointer has stopped moving.
   */
  private _onGridCellPointerDown(gridId: number, col: number, row: number, event: PointerEvent): void {
    if (gridId !== Match3Config.GRID_ID || this._isCellBusy(row, col)) return;
    // Reserve cells carry colliders like any other, so without this the gems stacked
    // above the board are clickable.
    if (!this._operations?.isPlayable(row)) return;
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
    // Two stripes traded with each other clear a cross, so like a cookie swap this
    // move needs no line of three to be legal.
    const stripeFirst = this._isStripe(svc.specialAt(r0, c0));
    const stripeSecond = this._isStripe(svc.specialAt(r1, c1));
    const stripeSwap = stripeFirst && stripeSecond;
    // Bomb + stripe do not go off at all: they merge into one oversize item. Read now,
    // since the swap moves both gems and the merge consumes them.
    const boosterFirst = svc.specialAt(r0, c0) === GemSpecial.Booster;
    const boosterSecond = svc.specialAt(r1, c1) === GemSpecial.Booster;
    const giantSwap =
      this._config?.giant.enabled === true && ((stripeFirst && boosterSecond) || (boosterFirst && stripeSecond));
    // Two bombs traded with each other go off as one bigger blast, so this swap needs no
    // line of three either.
    const bombPairSwap = boosterFirst && boosterSecond;
    const giantColor = stripeFirst ? svc.gemTypeAt(r0, c0) : svc.gemTypeAt(r1, c1);

    // Hold just these two cells for the swap tween. Every other cell stays playable,
    // and the chain started below claims only the cells it actually pops.
    this._claimedCells.add(k0);
    this._claimedCells.add(k1);
    try {
      if (!cookieSwap && !stripeSwap && !giantSwap && !bombPairSwap && !svc.peekSwapCreatesMatch(r0, c0, r1, c1)) {
        events.emitPlaySfx(Match3AssetIds.SfxWrong);
        await view.animateInvalidSwap(gridId, r0, c0, r1, c1);
        return;
      }
      events.emitPlaySfx(Match3AssetIds.SfxSwap);
      // Fired as the gems set off, not after they arrive: the ring marks the contact
      // that starts the move.
      view.animateSwapPulse(gridId, [
        { row: r0, col: c0 },
        { row: r1, col: c1 }
      ]);
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

    if (bombFirst && bombSecond) {
      // Two cookies: the whole board goes. Nothing else to resolve, and the chain it
      // starts settles the board on its way out.
      this._detonateCookiePair(gridId, { row: r1, col: c1 });
      this._lastSwap = null;
      return;
    }

    const comboKind = cookieSwap ? this._comboPartnerKind(bombFirst, r0, c0, r1, c1) : GemSpecial.None;
    if (comboKind !== GemSpecial.None) {
      // The combination owns this move. Returning here skips the `_settle` below on
      // purpose: the swap may also line up three of that colour, and resolving it would
      // clear the very gems the combination is about to turn into boosters.
      void this._runCookieComboAsync(gridId, partnerType, comboKind);
      this._lastSwap = null;
      return;
    }
    if (cookieSwap) {
      // The cookie has traded places, so it now sits where its partner was. Detonate
      // it there on the partner's colour; `_settle` would not find it, since a cookie
      // swap makes no match of its own.
      this._detonateCookie(gridId, bombFirst ? { row: r1, col: c1 } : { row: r0, col: c0 }, partnerType);
    } else if (bombPairSwap) {
      // Centred where the swipe ended, like the merge above.
      this._detonateBombPair(gridId, { row: r1, col: c1 });
    } else if (giantSwap) {
      // Centred where the swipe ENDED — the cell the dragged gem was carried onto, which
      // is where the player is looking. Pulled inside the board if that sits too near an
      // edge for a whole block.
      void this._runGiantAsync(gridId, { row: r1, col: c1 }, giantColor);
    } else if (stripeSwap) {
      // Centred on the cell the player swiped FROM — the gem they grabbed — with the
      // neighbour it traded with as the other half of the cross.
      this._detonateStripePlus(gridId, { row: r0, col: c0 }, { row: r1, col: c1 });
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
      const { cells, bolts } = this._expand(
        group.flatMap((run) => [...run.cells]),
        undefined,
        (cell) => {
          const ready = this._isBoosterReady(cell);
          // Remember the ones held back — their trigger vanishes with this clear.
          if (!ready) this._pendingBoosters.add(svc.itemIdAt(cell.row, cell.col));
          return ready;
        }
      );
      // An L collapses INWARD: the far ends of both arms go first and the corner last,
      // so the booster is born out of the final gem to vanish. Waves are therefore the
      // inverse of the distance from the joint. Sweep cells keep the waves the
      // expansion gave them; only the match's own cells (wave 0) are renumbered.
      const junction = this._junctionOf(group);
      if (junction) {
        const own = cells.filter((c) => c.wave === 0);
        const reach = own.reduce(
          (max, c) => Math.max(max, Math.abs(c.row - junction.row) + Math.abs(c.col - junction.col)),
          0
        );
        for (const c of own) {
          c.wave = reach - (Math.abs(c.row - junction.row) + Math.abs(c.col - junction.col));
        }
      }
      // Only a cell another chain has claimed is off limits. A gem still in the air is
      // fair game — the model already has it in this cell, and specials clear such gems
      // too, so gating matches on it made the two paths disagree.
      if (cells.some((c) => this._claimedCells.has(this._cellKey(c.row, c.col)))) continue;
      // Claimed synchronously, before the chain's first await, so two settle calls
      // can never hand the same cells to two chains.
      for (const c of cells) this._claimedCells.add(this._cellKey(c.row, c.col));
      // Any booster held back by this clear starts pulsing now, not when the chain ends
      // — by then it is already going off and the blink would never be seen.
      this._updateBlink(gridId);
      void this._runChainAsync(gridId, cells, this._planSpecial(group, cfg), bolts);
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

    // A colourless partner names no colour — swapping two cookies, since a cookie has
    // none of its own. It takes one from the board instead of fizzling.
    const color = gemType >= 0 ? gemType : svc.randomVisibleGemType();
    const named = new Map<string, number>([[this._cellKey(at.row, at.col), color]]);
    const { cells, bolts } = this._expand([at], named);
    if (cells.some((c) => this._claimedCells.has(this._cellKey(c.row, c.col)))) return;
    // Claimed before the strike, so nothing falls into these cells or matches on them
    // while the bolts are still travelling.
    for (const c of cells) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, cells, null, bolts, this._config?.combos.cookieGem);
  }

  /**
   * Throws a shockwave from every stripe about to fire in this clear. Driven off what
   * is actually on the board rather than off how the clear was planned, so it covers a
   * stripe caught in a match, one set off by another blast, and a converted one alike.
   */
  private _playStripeWaves(gridId: number, cells: readonly Cell[]): void {
    const svc = this._operations;
    const view = this._gridsView;
    if (!svc || !view) return;

    for (const c of cells) {
      const kind = svc.specialAt(c.row, c.col);
      if (this._isStripe(kind)) view.animateStripeWave(gridId, c, kind === GemSpecial.StripedRow);
    }
  }

  /**
   * Bomb + stripe: they merge instead of going off.
   *
   * The block's gems are cleared and one oversize item takes their place. Its cells stay
   * CLAIMED for its whole life, which is what makes the block count as filled: gravity
   * and refill both treat a claimed cell as solid, so nothing drops into it or is spawned
   * there while the waves run. Then the rows it covers go, all at once and end to end;
   * after a gap the columns do the same; and when that is finished the item removes
   * itself, the claims drop and the block falls and fills like anywhere else.
   */
  private async _runGiantAsync(gridId: number, at: Cell, gemType: number): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    const cfg = this._config;
    const events = this._gameEvents;
    if (!svc || !view || !cfg || !events) return;

    const span = cfg.giant.spanCells;
    const centre = svc.blockCentre(at, span);
    const block = svc.blockCells(at, span);
    // Claimed before the first await, so no chain started in the meantime can take a
    // cell out from under the item.
    const held = block.map((c) => this._cellKey(c.row, c.col));
    for (const k of held) this._claimedCells.add(k);
    let holding = true;
    const releaseBlock = (): void => {
      if (!holding) return;
      holding = false;
      for (const k of held) this._claimedCells.delete(k);
    };

    try {
      events.emitPlaySfx(Match3AssetIds.SfxPop, this._nextPopRate());
      void view.animateClearMatches(gridId, block);
      svc.clearMatchedCells(block);
      // Colourless would do — nothing matches it — but it takes the stripe's colour so
      // the oversize gem is recognisably the one that went in.
      const color = gemType >= 0 ? gemType : svc.randomVisibleGemType();
      svc.createSpecial(centre.row, centre.col, color, GemSpecial.GiantStripe);

      this._playBandWaves(gridId, centre, span, true);
      await this._runBandAsync(gridId, at, span, "row");
      await this._waitSec(cfg.giant.waveGapSec);

      // The item goes WITH the second wave, not after it: the columns are the last thing
      // it does, so it pops as they start rather than sitting on a board it has finished
      // with. Removed rather than cleared — it stands in for the nine gems already scored
      // when the block was made, and clearing it would count them twice.
      void view.animateClearMatches(gridId, [centre]);
      svc.removeItemAt(centre.row, centre.col);
      // Released the moment it goes. Held any longer, the gems stacked above the block
      // would be handed a target just above it, land there, and then have to set off
      // again once it was let go — which is the hitch you see as they pass the block.
      // It also puts the block's cells back into the column wave, so the columns clear
      // end to end rather than around a hole.
      releaseBlock();
      this._playBandWaves(gridId, centre, span, false);
      await this._runBandAsync(gridId, at, span, "column");
      await this._waitSec(cfg.giant.endHoldSec);
    } finally {
      releaseBlock();
    }

    // The block is free at last, so this is the pass that fills it.
    await this._applyFallAsync(gridId);
    events.emitScoreChanged(this._gameModel!.score);
    events.emitGoalChanged(this._gameModel!.cleared, cfg.goal);
    this._settle(gridId);
  }

  /**
   * Two cookies traded with each other: every gem on the board, taken a column at a
   * time from the left.
   *
   * Not run through the expansion like the other combinations. Everything is going
   * anyway, so there is nothing for a caught special to add — and a cookie in there
   * would renumber the cells it took to its own step, which is exactly what would break
   * the left-to-right order.
   */
  private _detonateCookiePair(gridId: number, from: Cell): void {
    const svc = this._operations;
    if (!svc) return;

    const cells = svc.boardCellsLeftToRight().filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (cells.length === 0) return;
    for (const c of cells) this._claimedCells.add(this._cellKey(c.row, c.col));
    // One volley per column, each tagged with the step it belongs to: the bolts reach a
    // column, that column goes, and the pair works its way across the board. The
    // expansion is skipped on this path, so this is the one place that has to say so.
    const bolts: CookieBolt[] = [];
    for (const col of new Set(cells.map((c) => c.col))) {
      const targets = cells.filter((c) => c.col === col && (c.row !== from.row || c.col !== from.col));
      if (targets.length > 0) bolts.push({ from, targets, wave: col });
    }
    void this._runChainAsync(gridId, cells, null, bolts, this._config?.combos.cookiePair);
  }

  /**
   * Two bombs set off together: one square blast around the swap, `booster.pairRadius`
   * out, instead of the two overlapping rings they would throw one at a time.
   *
   * It goes through the ordinary expansion, so a stripe or a cookie standing inside the
   * square is caught by it and chains as usual.
   */
  private _detonateBombPair(gridId: number, at: Cell): void {
    const svc = this._operations;
    const cfg = this._config;
    if (!svc || !cfg) return;

    const { cells, bolts } = this._expand(svc.areaCells(at, cfg.booster.pairRadius));
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) return;
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, free, null, bolts, this._config?.combos.bombPair);
  }

  /**
   * The shockwaves for one of the merged item's waves — one per line it covers, thrown
   * both ways, exactly as a single stripe throws its own. Three rows first, then three
   * columns, so the effect says which half of the combination is running.
   */
  private _playBandWaves(gridId: number, centre: Cell, span: number, alongRow: boolean): void {
    const view = this._gridsView;
    if (!view) return;

    const half = Math.floor(span / 2);
    for (let i = -half; i <= half; i++) {
      const from = alongRow ? { row: centre.row + i, col: centre.col } : { row: centre.row, col: centre.col + i };
      view.animateStripeWave(gridId, from, alongRow);
    }
  }

  /** One of the merged item's two waves: its rows, or its columns, cleared end to end. */
  private async _runBandAsync(gridId: number, at: Cell, span: number, axis: "row" | "column"): Promise<void> {
    const svc = this._operations;
    if (!svc) return;

    // Anything already spoken for drops out — the item's own block above all, which is
    // claimed for the duration and must survive its own waves.
    const { cells, bolts } = this._expand(svc.bandCells(at, span, axis));
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) return;
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    await this._runChainAsync(gridId, free, null, bolts, this._config?.combos.giant);
  }

  /**
   * {@link GameOperations.expandSpecialClears}, with the cookies it sets off collected
   * on the way out. Every path that starts a clear goes through here, so a cookie throws
   * its bolts whether it was swapped, caught in a sweep or caught in a blast.
   */
  private _expand(
    seed: readonly (Cell & { wave?: number })[],
    bombColors?: ReadonlyMap<string, number>,
    boosterReady?: (cell: Cell) => boolean
  ): { cells: SweepCell[]; bolts: CookieBolt[] } {
    const svc = this._operations;
    if (!svc) return { cells: [], bolts: [] };

    const bolts: CookieBolt[] = [];
    const cells = svc.expandSpecialClears(seed, bombColors, boosterReady, (from, targets) => {
      const hits = targets.filter((t) => t.row !== from.row || t.col !== from.col);
      if (hits.length > 0) bolts.push({ from, targets: hits });
    });
    return { cells, bolts };
  }

  /** A stripe of either axis. Both clear a line; only the direction differs. */
  private _isStripe(kind: GemSpecial): boolean {
    return kind === GemSpecial.StripedRow || kind === GemSpecial.StripedColumn;
  }

  /**
   * Two stripes swapped: clears the whole row AND the whole column through `at`.
   *
   * Both gems are demoted to ordinary ones first. Left striped, the expansion below
   * would fire each of them along its own axis on top of the cross — two row-stripes
   * swapped vertically would take a second, unrelated row with them. Everything ELSE
   * the cross catches still chains as usual, so a stripe or a booster standing in it
   * goes off too.
   */
  private _detonateStripePlus(gridId: number, at: Cell, partner: Cell): void {
    const svc = this._operations;
    if (!svc) return;

    // Both arms of the cross, thrown from the crossing. Played here rather than left to
    // `_playStripeWaves` because the two stripes are demoted on the next line, so by the
    // time the chain runs there is nothing left on the board to read them off.
    this._gridsView?.animateStripeWave(gridId, at, true);
    this._gridsView?.animateStripeWave(gridId, at, false);
    for (const c of [at, partner]) {
      svc.createSpecial(c.row, c.col, svc.gemTypeAt(c.row, c.col), GemSpecial.None);
    }
    const { cells, bolts } = this._expand(svc.plusCells(at));
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) return;
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, free, null, bolts, this._config?.combos.stripePair);
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
    const junction = this._junctionOf(group);
    if (junction && cfg.booster.enabled) {
      const size = new Set(group.flatMap((r) => r.cells.map((c) => this._cellKey(c.row, c.col)))).size;
      if (size >= cfg.booster.minCells && size <= cfg.booster.maxCells) {
        return { row: junction.row, col: junction.col, gemType: group[0].gemType, special: GemSpecial.Booster };
      }
    }

    const longest = group.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const cookie = longest.cells.length >= cfg.special.minCookieRunLength;
    if (cookie ? !cfg.special.cookieEnabled : !cfg.special.stripesEnabled) return null;
    if (longest.cells.length < cfg.special.minRunLength) return null;

    const alongRow = cfg.special.alongMatch ? longest.orientation === "row" : longest.orientation === "column";
    const kind = cookie ? GemSpecial.ColorBomb : alongRow ? GemSpecial.StripedRow : GemSpecial.StripedColumn;
    // A vertical run always leaves its special in the LOWEST of its cells, whichever one
    // the player touched. The board falls downward, so the bottom of the run is where
    // the column settles — put it anywhere else and the gems coming down land on top of
    // it, burying a gem the player just earned.
    //
    // A horizontal run has no such bottom, so it keeps the rule that reads best there:
    // under the player's finger when the swap is part of the match, otherwise mid-run.
    const swapped = this._lastSwap?.find((c) => longest.cells.some((rc) => rc.row === c.row && rc.col === c.col));
    const at =
      longest.orientation === "column"
        ? longest.cells.reduce((lowest, c) => (c.row > lowest.row ? c : lowest))
        : swapped ?? longest.cells[Math.floor(longest.cells.length / 2)];

    return { row: at.row, col: at.col, gemType: longest.gemType, special: kind };
  }

  /**
   * The cell where a horizontal and a vertical run cross — the corner of an L or the
   * centre of a T. `null` when the group is a single straight run, which is what
   * separates an L match from an ordinary one.
   */
  private _junctionOf(group: MatchRun[]): Cell | null {
    const rowRun = group.find((r) => r.orientation === "row");
    const colRun = group.find((r) => r.orientation === "column");
    if (!rowRun || !colRun) return null;

    return (
      rowRun.cells.find((a) => colRun.cells.some((b) => b.row === a.row && b.col === a.col)) ?? null
    );
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

  /**
   * Whether a booster may go off now: only once every cell around it holds a gem.
   *
   * No "is a cascade running" condition — that was the earlier rule and it never fired,
   * because a chain awaits its fall before the next match is evaluated, so nothing is
   * ever in the air at that moment. It is also unnecessary: the board always refills,
   * so a full ring is guaranteed to arrive; the booster simply waits for it.
   */
  private _isBoosterReady(cell: Cell): boolean {
    const svc = this._operations;
    const cfg = this._config;
    if (!svc || !cfg) return true;

    const neighbours = svc.neighbourCells(cell.row, cell.col);
    const wanted = Math.min(cfg.booster.minNeighbours, neighbours.length);
    return svc.occupiedNeighbourCount(cell.row, cell.col) >= wanted;
  }

  /**
   * Fires any waiting booster whose surroundings have filled in, and keeps the blink on
   * the ones still holding. Called after every chain, which is when the board around
   * them has just changed.
   */
  private _servicePendingBoosters(gridId: number): void {
    const svc = this._operations;
    const view = this._gridsView;
    if (!svc || !view || this._pendingBoosters.size === 0) return;

    const stillWaiting: Cell[] = [];
    for (const itemId of [...this._pendingBoosters]) {
      const at = this._findItem(itemId);
      if (!at || svc.specialAt(at.row, at.col) !== GemSpecial.Booster) {
        this._pendingBoosters.delete(itemId);
        continue;
      }

      if (!this._isBoosterReady(at)) {
        stillWaiting.push(at);
        continue;
      }

      this._pendingBoosters.delete(itemId);
      this._detonateSpecial(gridId, at);
    }
    view.setBlinking(gridId, stillWaiting);
  }

  /** Points the view at whichever pending boosters are still on the board. */
  private _updateBlink(gridId: number): void {
    const view = this._gridsView;
    if (!view) return;

    const cells: Cell[] = [];
    for (const itemId of [...this._pendingBoosters, ...this._comboQueue]) {
      const at = this._findItem(itemId);
      if (at) cells.push(at);
    }
    view.setBlinking(gridId, cells);
  }

  /** Where a gem is right now — it moves with gravity, so the id is the stable handle. */
  private _findItem(itemId: number): Cell | null {
    const svc = this._operations;
    if (!svc) return null;
    for (let row = svc.firstVisibleRow; row < svc.rows; row++) {
      for (let col = 0; col < svc.cols; col++) {
        if (svc.itemIdAt(row, col) === itemId) return { row, col };
      }
    }
    return null;
  }

  /**
   * What the cookie was traded with, if it was another special — the combination case.
   * `None` for a plain gem, which takes the ordinary "clear that colour" path.
   */
  private _comboPartnerKind(bombFirst: boolean, r0: number, c0: number, r1: number, c1: number): GemSpecial {
    const svc = this._operations;
    if (!svc) return GemSpecial.None;
    // Read AFTER the swap has been applied: the partner now sits where the cookie was.
    const at = bombFirst ? { row: r0, col: c0 } : { row: r1, col: c1 };
    const kind = svc.specialAt(at.row, at.col);
    return kind === GemSpecial.ColorBomb ? GemSpecial.None : kind;
  }

  /**
   * Cookie traded with another special: every gem of that special's colour becomes the
   * same kind of special, and then they go off one at a time. Each pulses from the
   * moment it is converted until its own turn, so the queue reads rather than firing at
   * once. Works for any kind — the bomb takes its neighbours, a stripe sweeps its line.
   */
  private async _runCookieComboAsync(gridId: number, gemType: number, kind: GemSpecial): Promise<void> {
    const svc = this._operations;
    const cfg = this._config;
    if (!svc || !cfg || gemType < 0) return;

    for (const cell of svc.visibleCellsOfType(gemType)) {
      // Stripes get a random axis each, so the combination sweeps the board in both
      // directions rather than laying down a set of parallel lines.
      const axis =
        kind === GemSpecial.StripedRow || kind === GemSpecial.StripedColumn
          ? Math.random() < 0.5
            ? GemSpecial.StripedRow
            : GemSpecial.StripedColumn
          : kind;
      svc.createSpecial(cell.row, cell.col, gemType, axis);
      // Tracked by id, not position: gravity moves them while the queue is draining.
      this._comboQueue.add(svc.itemIdAt(cell.row, cell.col));
    }
    this._updateBlink(gridId);
    // Everything pulses together for a beat before the first one goes, so the player
    // sees what the combination did.
    await this._waitSec(cfg.booster.chainStartDelaySec);

    for (const itemId of [...this._comboQueue]) {
      const at = this._findItem(itemId);
      this._comboQueue.delete(itemId);
      this._updateBlink(gridId);
      if (at) this._detonateSpecial(gridId, at);
      await this._waitSec(cfg.booster.chainDelaySec);
    }
  }

  /** Sets off any special on its own, outside a match — the expansion dispatches. */
  private _detonateSpecial(gridId: number, at: Cell): void {
    const svc = this._operations;
    if (!svc) return;

    // Drop the cells another chain already owns and fire with what is left. Aborting on
    // any overlap meant that in a combination — where five stripes sweep rows and
    // columns that inevitably cross — every one after the first was skipped.
    const { cells, bolts } = this._expand([at]);
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) return;
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, free, null, bolts);
  }

  /**
   * Runs a clear as a wave. Cells carry a `wave` number — distance along a stripe's
   * sweep, or inward along an L — and each step pops and clears before the next starts,
   * `sweepStepSec` apart. With a single wave (an ordinary match) this is one pass and
   * costs nothing.
   */
  private async _sweepClearAsync(
    gridId: number,
    cells: SweepCell[],
    owned?: Set<string>,
    staged: CookieBolt[] = [],
    pace?: ClearPace
  ): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    const cfg = this._config;
    if (!svc || !view || !cfg) return;

    const byWave = new Map<number, SweepCell[]>();
    for (const cell of cells) {
      const step = byWave.get(cell.wave) ?? [];
      step.push(cell);
      byWave.set(cell.wave, step);
    }

    const waves = [...byWave.keys()].sort((a, b) => a - b);

    // Staged bolts are PIPELINED, not awaited step by step. Each volley is thrown one
    // flight-time before the step it belongs to, so it lands exactly as that step pops —
    // and the sweep then runs at its own pace throughout.
    //
    // Waiting for each volley in turn would have made the flight part of the cadence:
    // shortening the sweep would have meant shortening the bolts, and the two are not
    // the same thing. The flight is a fixed effect (`cookieBeam.strikeSec`); the spacing
    // is `special.sweepStepSec`. Here they cost one lead-in between them, once.
    const timing = pace ?? this._basePace();
    if (staged.length > 0) {
      for (const bolt of staged) {
        const step = waves.indexOf(bolt.wave ?? 0);
        if (step < 0) continue;
        void this._waitSec(step * timing.stepSec).then(() =>
          view.animateCookieBeams(gridId, bolt.from, bolt.targets, timing.beamSec)
        );
      }
      await this._waitSec(timing.beamSec);
    }

    for (let i = 0; i < waves.length; i++) {
      const step = byWave.get(waves[i])!;
      // Wave 0 within the call: these pop now, the stagger lives out here.
      void view.animateClearMatches(gridId, step.map((c) => ({ row: c.row, col: c.col })));
      svc.clearMatchedCells(step);
      // Handed back the moment they are empty. A cell still ahead of the wave stays
      // claimed and stays solid, but one the wave has passed has nothing left to protect
      // — so the gems above it start down NOW instead of waiting for the far end of a
      // long sweep. Deleted from `owned` too, so the chain's own release cannot later
      // drop a claim another chain has since taken on the same cell.
      if (owned) {
        let freed = false;
        for (const c of step) {
          const k = this._cellKey(c.row, c.col);
          if (owned.delete(k)) {
            this._claimedCells.delete(k);
            freed = true;
          }
        }
        if (freed) void this._applyFallAsync(gridId);
      }
      if (i < waves.length - 1 && timing.stepSec > 0) {
        await this._waitSec(timing.stepSec);
      }
    }
  }

  private _cellKey(row: number, col: number): string {
    return `${row},${col}`;
  }

  /**
   * A wait in GAME seconds. Stretched by `timeScale`, so the gaps between sweep steps
   * and between the boosters of a combination slow down with everything else — left on
   * wall-clock they would race ahead while the board crawled.
   */
  private _waitSec(seconds: number): Promise<void> {
    const scale = Math.max(0, this._config?.timeScale ?? 1);
    // A frozen board would never resolve the timer; hold for a frame and re-check, so
    // unpausing from the console picks the sequence back up where it stopped.
    if (scale <= 0) return new Promise((resolve) => requestAnimationFrame(() => resolve(this._waitSec(seconds))));
    return new Promise((resolve) => setTimeout(resolve, (seconds / scale) * 1000));
  }

  /**
   * The shared pacing, for a clear that is not one of the combinations — an ordinary
   * match, or a single special going off on its own.
   */
  private _basePace(): ClearPace {
    const cfg = this._config;
    return { stepSec: cfg?.special.sweepStepSec ?? 0, beamSec: cfg?.cookieBeam.strikeSec ?? 0 };
  }

  /** Bound so it can be handed to the model as a barrier test. */
  private readonly _isCellClaimed = (row: number, col: number): boolean =>
    this._claimedCells.has(this._cellKey(row, col));

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

  private async _runChainAsync(
    gridId: number,
    cells: SweepCell[],
    special: SpecialSpawn | null = null,
    bolts: CookieBolt[] = [],
    pace?: ClearPace
  ): Promise<void> {
    this._activeChains++;
    try {
      await this._runChainBodyAsync(gridId, cells, special, bolts, pace);
    } finally {
      this._activeChains--;
      // Quiet board: the next move starts from the base note again.
      if (this._activeChains === 0) this._comboStep = 0;
    }
  }

  private async _runChainBodyAsync(
    gridId: number,
    cells: SweepCell[],
    special: SpecialSpawn | null = null,
    bolts: CookieBolt[] = [],
    pace?: ClearPace
  ): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    const events = this._gameEvents;
    // The cells this chain is holding, as a live set: the sweep hands each step back as
    // it clears it, so what is left here is only what the chain has still to reach.
    const owned = new Set(cells.map((c) => this._cellKey(c.row, c.col)));
    const release = (): void => {
      for (const k of owned) this._claimedCells.delete(k);
      owned.clear();
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
      // The special is created BEFORE the clear, and its own cell dropped from the
      // wave: the gem that earned it is promoted rather than popped and rebuilt, so
      // the booster appears in the same instant its match starts popping.
      //
      // It also means the gravity pass below sees the booster like any other gem, so
      // an empty column under it pulls it down instead of leaving it hanging where the
      // match happened — which is what the old "create it after the clear" order did.
      let wave = cells;
      if (special) {
        svc.createSpecial(special.row, special.col, special.gemType, special.special);
        view.animateSpecialSpawn(gridId, special);
        wave = cells.filter((c) => c.row !== special.row || c.col !== special.col);
      }
      // Every cookie in this clear throws its bolts first and the gems go on impact —
      // however the cookie was set off. Awaited, so the pop follows the hit rather than
      // racing it; with no cookie involved this is a no-op and nothing is delayed.
      const timing = pace ?? this._basePace();
      const upfront = bolts.filter((b) => b.wave === undefined);
      if (upfront.length > 0) {
        await Promise.all(upfront.map((b) => view.animateCookieBeams(gridId, b.from, b.targets, timing.beamSec)));
      }
      events.emitPlaySfx(Match3AssetIds.SfxPop, this._nextPopRate());
      this._shakeIfBig(cells.length);
      // Read off the board before anything is cleared: the stripes are still standing
      // here, and once the sweep starts their gems are gone.
      this._playStripeWaves(gridId, wave);
      // The clear travels as a wave: each step is popped AND removed from the model
      // before the next begins, so nothing falls until the wave has passed over it.
      // Clearing the whole set at once and staggering only the visuals left the gems
      // dropping behind a line that was still on screen.
      await this._sweepClearAsync(
        gridId,
        wave,
        owned,
        bolts.filter((b) => b.wave !== undefined),
        timing
      );
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
    await this._applyFallAsync(gridId);
    events.emitScoreChanged(this._gameModel!.score);
    events.emitGoalChanged(this._gameModel!.cleared, this._config!.goal);

    this._servicePendingBoosters(gridId);
    this._settle(gridId);
  }

  /**
   * Compacts the whole board and tops it up, then flies the result — the one place
   * gravity is applied, so every caller gets the same rules.
   *
   * Cells another clear is still working through are solid to this pass. A staggered
   * clear takes several steps, and this is board-wide: without the barrier it would pull
   * gems into cells that clear has already popped but not finished with, and its
   * remaining steps would then take whatever slid in — the mess that showed up as soon
   * as two matches overlapped, and worst around a freshly made stripe.
   */
  private async _applyFallAsync(gridId: number): Promise<void> {
    const svc = this._operations;
    const view = this._gridsView;
    if (!svc || !view) return;

    const allCols = new Set(Array.from({ length: svc.cols }, (_, i) => i));
    // Read before the model moves anything: the grid rebuilds a gem's object on every
    // cell change, so afterwards there is no record of where it was rendering.
    const captured = view.captureGemPositions(gridId, allCols);
    const moves = svc.applyGravity(undefined, this._isCellClaimed);
    const spawns = svc.refillEmpty(undefined, this._isCellClaimed);

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
