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

/** A bomb that survived its blast, and the sweep step it was struck on. */
type ArmedBomb = { itemId: number; wave: number };

/**
 * How one clear is timed: the gap between its steps, and how long its bolts fly.
 * Combinations pass their own (see `Match3Config.combos`); everything else takes the
 * shared values.
 */
type ClearPace = {
  stepSec: number;
  beamSec: number;
  /**
   * Gap between two steps of the SAME column, where `stepSec` is the gap between columns.
   * Only the cookie pair sweeps in two directions at once; everything else leaves this
   * unset and every step is `stepSec` apart.
   */
  rowStepSec?: number;
};

export class GameBoardsViewController extends GridsViewController {
  /** Shortest gap between two fall passes — one frame at 60Hz. See {@link _requestFall}. */
  private static readonly FALL_MIN_MS = 16;
  private _lastFallAt = 0;
  private _fallScheduled = false;
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
  /**
   * Colours a cookie is in the middle of taking. Another cookie going off at the same
   * time picks a different one — the same colour twice would leave the second with
   * nothing to clear, since the first is already taking all of it.
   */
  private readonly _firingColours = new Set<number>();
  /**
   * Bombs that have gone off but are not used up, and how many blasts each has fired.
   * Keyed by item id — the board keeps moving between one blast and the next.
   *
   * A waiting bomb is not FIRED again (a blast reaching it does nothing) but it is still
   * an ordinary gem for every other purpose: a clear may take it, and then its pending
   * turn simply finds it gone. Making it immune to clearing as well is what deadlocked a
   * column of them — none could be cleared and none could fire.
   */
  private readonly _boosterBlasts = new Map<number, number>();
  /**
   * Bombs that must be spent by the blast they are about to fire, whatever `bomb.blasts`
   * says — the two that made a bomb+bomb combination. They put their blasts into the one
   * big one, so they go with it; a bomb the blast merely CATCHES is untouched by this and
   * carries on as normal.
   */
  private readonly _spendFully = new Set<number>();
  /** The bomb whose own turn it is: exempt from the guard above, or it blocks itself. */
  private _firingBooster: number | null = null;
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
    // The mask is the board's top edge, and it is handed to the gem rather than set on the
    // renderer: renderer-wide it cut the backdrop, the frame and the shockwave too.
    const maskTopZ = cfg.clipToBoard ? -cfg.boardDepth * 0.5 : null;
    return new GameBoardItemObjectOptions(item.itemId, grid.preset, item.gemType, cfg.gemShadow, item.special, cfg.stripe, cfg.bomb, cfg.selection, cfg.combos.bombStripe.spanCells, maskTopZ);
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
      this._config?.combos.bombStripe.enabled === true && ((stripeFirst && boosterSecond) || (boosterFirst && stripeSecond));
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
      // The cookie has traded places, so it now sits where its partner was.
      void this._runCookieComboAsync(gridId, bombFirst ? { row: r1, col: c1 } : { row: r0, col: c0 }, partnerType, comboKind);
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
      // Both of them are spent on this one blast rather than each keeping a second.
      for (const c of [{ row: r0, col: c0 }, { row: r1, col: c1 }]) {
        const id = svc.itemIdAt(c.row, c.col);
        if (id >= 0) this._spendFully.add(id);
      }
      this._detonateBombPair(gridId, { row: r1, col: c1 });
    } else if (giantSwap) {
      // Centred where the swipe ENDED — the cell the dragged gem was carried onto, which
      // is where the player is looking. Pulled inside the board if that sits too near an
      // edge for a whole block.
      void this._runGiantAsync(gridId, { row: r1, col: c1 }, giantColor);
    } else if (stripeSwap) {
      // Centred where the swap ENDED — the cell the dragged stripe was carried onto, which
      // is both where the player is looking and where that stripe now stands. Centring on
      // the cell they swiped FROM crossed the lines through the gem they had let go of.
      //
      // The same rule as every other combination here (the bomb pair, the merge): the move
      // happens at its destination.
      this._detonateStripePlus(gridId, { row: r1, col: c1 }, { row: r0, col: c0 });
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
   * Resolves every match standing on the board as ONE step: they pop together, and the
   * board falls once afterwards.
   *
   * One step rather than one chain per match, which is what it used to be. Independent
   * matches genuinely are simultaneous — the player made them in the same move, or the
   * same cascade dropped them — so they belong in the same clear. Giving each its own
   * chain only worked while chains overlapped; now that the board runs them in order, a
   * chain apiece would pop the second match after the first had already cleared, fallen
   * and refilled, which reads as two separate moves the player did not make.
   *
   * Called after a swap and after every step, so no match is left unresolved.
   */
  private _settle(gridId: number): void {
    const svc = this._operations;
    const cfg = this._config;
    if (!svc || !cfg) return;

    const cells: SweepCell[] = [];
    const bolts: CookieBolt[] = [];
    const colours: number[] = [];
    const specials: SpecialSpawn[] = [];
    const armed: ArmedBomb[] = [];
    const taken = new Set<string>();

    for (const group of this._runGroups(svc.findMatchRuns())) {
      // A striped gem caught in the match fires too, and whatever its sweep catches
      // joins the same clear — resolved before claiming so the step owns every cell
      // it is about to touch.
      const expanded = this._expand(
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
        const own = expanded.cells.filter((c) => c.wave === 0);
        const reach = own.reduce(
          (max, c) => Math.max(max, Math.abs(c.row - junction.row) + Math.abs(c.col - junction.col)),
          0
        );
        for (const c of own) {
          c.wave = reach - (Math.abs(c.row - junction.row) + Math.abs(c.col - junction.col));
        }
      }
      // A cell the board is already working through is off limits — the giant's block for
      // its whole life, and a sweep still travelling. It goes off there, not here.
      if (expanded.cells.some((c) => this._claimedCells.has(this._cellKey(c.row, c.col)))) {
        this._abandonClear(gridId, expanded.colours, expanded.armed);
        continue;
      }

      const special = this._planSpecial(group, cfg);
      if (special) specials.push(special);
      bolts.push(...expanded.bolts);
      colours.push(...expanded.colours);
      armed.push(...expanded.armed);
      // Two expansions can reach the same cell — one stripe's sweep crossing another
      // match. It is cleared once, keeping the earlier (lower) wave so the step it goes
      // on is the first one that claimed it.
      for (const c of expanded.cells) {
        const k = this._cellKey(c.row, c.col);
        if (taken.has(k)) continue;
        taken.add(k);
        cells.push(c);
      }
    }

    if (cells.length === 0) {
      // Nothing to clear, but a bomb may still have been armed — a group made entirely of
      // bombs that all survived. They are owed their pulse just the same.
      this._abandonClear(gridId, [], armed);
      return;
    }

    // Claimed synchronously, before the step's first await, so nothing else can hand the
    // same cells out while this one is starting.
    for (const k of taken) this._claimedCells.add(k);
    // Any booster held back by this clear starts pulsing now, not when the step ends
    // — by then it is already going off and the blink would never be seen.
    this._updateBlink(gridId);
    void this._runChainAsync(gridId, cells, specials, bolts, undefined, colours, true, armed);
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
    const { cells, bolts, colours, armed } = this._expand([at], named);
    if (cells.some((c) => this._claimedCells.has(this._cellKey(c.row, c.col)))) {
      this._abandonClear(gridId, colours, armed);
      return;
    }
    // Claimed before the strike, so nothing falls into these cells or matches on them
    // while the bolts are still travelling.
    for (const c of cells) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, cells, [], bolts, this._config?.combos.cookieGem, colours, false, armed);
  }

  /**
   * Throws a shockwave from every stripe about to fire in this clear. Driven off what
   * is actually on the board rather than off how the clear was planned, so it covers a
   * stripe caught in a match, one set off by another blast, and a converted one alike.
   */
  private _playStripeWaves(gridId: number, cells: readonly Cell[], delaySec = 0): void {
    const svc = this._operations;
    const view = this._gridsView;
    if (!svc || !view) return;

    for (const c of cells) {
      const kind = svc.specialAt(c.row, c.col);
      if (this._isStripe(kind)) view.animateStripeWave(gridId, c, kind === GemSpecial.StripedRow, delaySec);
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

    const span = cfg.combos.bombStripe.spanCells;
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
      // Grows into the block it covers, and is registered as born in place so the next
      // fall pass does not treat it as a gem arriving from above.
      view.animateSpecialSpawn(gridId, centre);

      this._playBandWaves(gridId, centre, span, true);
      await this._runBandAsync(gridId, at, span, "row");
      await this._waitSec(cfg.combos.bombStripe.waveGapSec);

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
      await this._waitSec(cfg.combos.bombStripe.endHoldSec);
    } finally {
      releaseBlock();
    }

    // The block is free at last, so this is the pass that fills it.
    this._applyFall(gridId);
    await this._waitBoardSettledAsync();
    events.emitScoreChanged(this._gameModel!.score);
    events.emitGoalChanged(this._gameModel!.cleared, cfg.goal);
    this._settle(gridId);
  }

  /**
   * Two cookies traded with each other: every gem on the board, taken a column at a
   * time from the left.
   *
   * Not run through the expansion like the other combinations: a cookie in there would
   * renumber the cells it took to its own step, and that is what would break the
   * left-to-right order.
   *
   * Bombs are handled here instead, because skipping the expansion also skipped the only
   * place a booster is ever FIRED. "Cleared" and "fired" are separate things — the pair
   * simply deleted every cell it covered, so a bomb it swept up was never set off, never
   * counted a blast, and so never came back for its second one. It looked detonated and
   * was not. Its ring still adds nothing (the whole board is going anyway); what was
   * missing is the firing itself, which is what arms it and holds it out of this clear.
   */
  private _detonateCookiePair(gridId: number, from: Cell): void {
    const svc = this._operations;
    if (!svc) return;

    const board = svc.boardCellsLeftToRight().filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (board.length === 0) return;

    // Every bomb the pair covers is being set off, so each fires and each keeps whatever
    // blasts it has left, exactly as it would inside the expansion.
    // `wave` is the column, as it is for the bolts and the sweep below — so a bomb starts
    // pulsing when the pair reaches ITS column, not when the swap happens.
    const fired = board.filter((c) => svc.specialAt(c.row, c.col) === GemSpecial.Booster);
    const { kept, armed } = this._armSurvivingBoosters(fired);
    const cells = kept.size === 0 ? board : board.filter((c) => !kept.has(this._cellKey(c.row, c.col)));
    if (cells.length === 0) {
      // Nothing to clear, but a bomb may still have been armed — a group made entirely of
      // bombs that all survived. They are owed their pulse just the same.
      this._abandonClear(gridId, [], armed);
      return;
    }

    for (const c of cells) this._claimedCells.add(this._cellKey(c.row, c.col));
    // One volley per column, each tagged with the step it belongs to: the bolts reach a
    // column, that column goes, and the pair works its way across the board. The
    // expansion is skipped on this path, so this is the one place that has to say so.
    // One bolt per CELL, each tied to that cell's own step, so a gem is struck exactly as it
    // pops. A volley per COLUMN was what made the whole column light up at once: the sweep
    // had been split down to the cell but the bolts had not, so eight gems shared one throw
    // at the column's first step and only the pops kept the order.
    const bolts: CookieBolt[] = cells
      .filter((c) => c.row !== from.row || c.col !== from.col)
      .map((c) => ({ from, targets: [{ row: c.row, col: c.col }], wave: c.wave }));
    void this._runChainAsync(gridId, cells, [], bolts, this._config?.combos.cookiePair, [], false, armed);
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

    const { cells, bolts, colours, armed } = this._expand(svc.areaCells(at, cfg.combos.bombPair.radius));
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) {
      this._abandonClear(gridId, colours, armed);
      return;
    }
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, free, [], bolts, this._config?.combos.bombPair, colours, false, armed);
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
    const { cells, bolts, colours, armed } = this._expand(svc.bandCells(at, span, axis));
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) {
      this._abandonClear(gridId, colours, armed);
      return;
    }
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    await this._runChainAsync(gridId, free, [], bolts, this._config?.combos.bombStripe, colours, false, armed);
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
  ): { cells: SweepCell[]; bolts: CookieBolt[]; colours: number[]; armed: ArmedBomb[] } {
    const svc = this._operations;
    if (!svc) return { cells: [], bolts: [], colours: [], armed: [] };

    const bolts: CookieBolt[] = [];
    const colours: number[] = [];
    const survivors: SweepCell[] = [];
    const cells = svc.expandSpecialClears(seed, {
      bombColors,
      boosterReady,
      // A gem another clear is already working through goes off there, not here — which
      // is what stops two stripes in one row from each setting off the same cookie. A gem
      // waiting its turn in a combination is off limits for the same reason: its turn is
      // already booked, and firing it early is what made a converted board go off at once.
      skipCell: (cell, viaColourClear) =>
        this._isCellClaimed(cell.row, cell.col) || this._isWaitingItsTurn(cell, viaColourClear),
      excludeColours: this._firingColours,
      onBoosterFired: (from, wave) => survivors.push({ ...from, wave }),
      onCookieFired: (from, colour, targets) => {
        if (colour >= 0) colours.push(colour);
        const hits = targets.filter((t) => t.row !== from.row || t.col !== from.col);
        if (hits.length > 0) bolts.push({ from, targets: hits });
      },
    });
    // Held from here until the chain that took them is finished, so a cookie firing in
    // the meantime picks something else.
    for (const c of colours) this._firingColours.add(c);
    // A bomb with blasts left survives THIS clear — the one it just fired — and no more.
    const { kept, armed } = this._armSurvivingBoosters(survivors);
    // And it stays out of everyone ELSE's clear until it has: an armed bomb waiting for
    // its next blast is immune. Without this a cascade landing on it in the meantime
    // simply ate it — the trace read "bomb N was gone before its next blast" — so the
    // second blast and the pulse leading up to it were never seen.
    for (const c of cells) {
      // Owning a cell is not the same as being in it. A gem still above the window is
      // not on the board yet, so no wave may take it — the player would see a cell clear
      // that looks empty, and a gem vanish before it ever arrived.
      if (this._gridsView?.isAboveBoard(Match3Config.GRID_ID, c.row, c.col)) {
        kept.add(this._cellKey(c.row, c.col));
        continue;
      }
      const itemId = svc.itemIdAt(c.row, c.col);
      if (itemId < 0) continue;
      // Armed bombs and gems queued by a combination are both waiting on a turn of their
      // own. Skipping their firing is not enough — left in the clear they would simply be
      // taken as ordinary gems and the turn would never come.
      if (this._comboQueue.has(itemId)) kept.add(this._cellKey(c.row, c.col));
    }
    const remaining = kept.size === 0 ? cells : cells.filter((c) => !kept.has(this._cellKey(c.row, c.col)));
    return { cells: remaining, bolts, colours, armed };
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
    const { cells, bolts, colours, armed } = this._expand(svc.plusCells(at));
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) {
      this._abandonClear(gridId, colours, armed);
      return;
    }
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, free, [], bolts, this._config?.combos.stripePair, colours, false, armed);
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
    if (junction && cfg.bomb.enabled) {
      const size = new Set(group.flatMap((r) => r.cells.map((c) => this._cellKey(c.row, c.col)))).size;
      if (size >= cfg.bomb.minCells && size <= cfg.bomb.maxCells) {
        return { row: junction.row, col: junction.col, gemType: group[0].gemType, special: GemSpecial.Booster };
      }
    }

    const longest = group.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const cookie = longest.cells.length >= cfg.cookie.minRunLength;
    if (cookie ? !cfg.cookie.enabled : !cfg.stripe.enabled) return null;
    if (longest.cells.length < cfg.stripe.minRunLength) return null;

    const alongRow = cfg.stripe.alongMatch ? longest.orientation === "row" : longest.orientation === "column";
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

  /**
   * Off limits to the player: mid-pop (claimed by a chain), still in the air, or queued by
   * a combination.
   *
   * The queue is the cookie combination's own doing: it converts every gem of a colour and
   * then fires them one at a time. Those gems are spoken for — the combination is mid-play
   * and each has a turn booked — so the player may not move one out from under it. Left
   * swappable, a gem could be traded away between being converted and being fired, and the
   * combination would reach for a gem that had gone somewhere else.
   */
  private _isCellBusy(row: number, col: number): boolean {
    const key = this._cellKey(row, col);
    if (this._claimedCells.has(key) || this._animatingCells.has(key)) return true;
    const itemId = this._operations?.itemIdAt(row, col) ?? -1;
    return itemId >= 0 && this._comboQueue.has(itemId);
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
    const wanted = Math.min(cfg.bomb.minNeighbours, neighbours.length);
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
    for (const itemId of [...this._pendingBoosters, ...this._comboQueue, ...this._boosterBlasts.keys()]) {
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
  private async _runCookieComboAsync(gridId: number, from: Cell, gemType: number, kind: GemSpecial): Promise<void> {
    const svc = this._operations;
    const cfg = this._config;
    const view = this._gridsView;
    if (!svc || !cfg || !view || gemType < 0) return;

    const wantsStripe = kind === GemSpecial.StripedRow || kind === GemSpecial.StripedColumn;
    const pace = wantsStripe ? cfg.combos.cookieStripe : cfg.combos.cookieBomb;

    // The cookie throws its bolts here too, and the gems turn ON IMPACT. Its own paths
    // already do this; a combination that skipped it made the conversion look like it
    // came from nowhere.
    const struck = svc.visibleCellsOfType(gemType).filter((c) => {
      const standing = svc.specialAt(c.row, c.col);
      return wantsStripe ? !this._isStripe(standing) : standing !== kind;
    });
    await view.animateCookieBeams(gridId, from, struck, pace.beamSec);

    // Converting is the cookie's WHOLE job here. It is spent doing it and comes off the
    // board straight away: left standing, one of the sweeps it just created would reach it
    // and set it off again, and it would take a second colour with it.
    void view.animateClearMatches(gridId, [from]);
    svc.removeItemAt(from.row, from.col);
    for (const cell of svc.visibleCellsOfType(gemType)) {
      // Already what the combination would have made it — the partner the cookie was
      // swapped with, above all. It is left exactly as it stands rather than rebuilt: a
      // stripe would have its axis rerolled, and the player earned that axis.
      const standing = svc.specialAt(cell.row, cell.col);
      const already = wantsStripe ? this._isStripe(standing) : standing === kind;
      if (!already) {
        // Stripes get a random axis each, so the combination sweeps the board in both
        // directions rather than laying down a set of parallel lines.
        const axis = wantsStripe
          ? Math.random() < 0.5
            ? GemSpecial.StripedRow
            : GemSpecial.StripedColumn
          : kind;
        svc.createSpecial(cell.row, cell.col, gemType, axis);
        view.animateSpecialSpawn(gridId, cell);
      }
      // Queued whether or not it had to be built. Skipping the queue for the ones that
      // were already special is what stopped the swapped bomb from going off at all: it
      // was the right kind already, so nothing rebuilt it — and nothing fired it either.
      // The gem the player put into the combination sat there while every gem it had
      // converted went off around it.
      //
      // Tracked by id, not position: gravity moves them while the queue is draining.
      this._comboQueue.add(svc.itemIdAt(cell.row, cell.col));
    }
    this._updateBlink(gridId);
    // Everything pulses together for a beat before the first one goes, so the player
    // sees what the combination did.
    await this._waitSec(pace.startDelaySec);

    for (const itemId of [...this._comboQueue]) {
      const at = this._findItem(itemId);
      this._comboQueue.delete(itemId);
      this._updateBlink(gridId);
      // Fired on the combination's own pace, so its line pops with it rather than at the
      // board's shared rate, where the pops of one firing run into the next.
      if (at) this._detonateSpecial(gridId, at, pace);
      await this._waitSec(pace.stepDelaySec);
    }
  }

  /** Sets off any special on its own, outside a match — the expansion dispatches. */
  private _detonateSpecial(gridId: number, at: Cell, pace?: ClearPace): void {
    const svc = this._operations;
    if (!svc) return;

    // Drop the cells another chain already owns and fire with what is left. Aborting on
    // any overlap meant that in a combination — where five stripes sweep rows and
    // columns that inevitably cross — every one after the first was skipped.
    const { cells, bolts, colours, armed } = this._expand([at]);
    const free = cells.filter((c) => !this._claimedCells.has(this._cellKey(c.row, c.col)));
    if (free.length === 0) {
      this._abandonClear(gridId, colours, armed);
      return;
    }
    for (const c of free) this._claimedCells.add(this._cellKey(c.row, c.col));
    void this._runChainAsync(gridId, free, [], bolts, pace, colours, false, armed);
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
    pace?: ClearPace,
    fromMatch = false,
    armed: ArmedBomb[] = []
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
    // When each step starts, measured from the first. Accumulated rather than multiplied out
    // because the gaps are not all equal: a pace may beat faster down a column than across
    // to the next one, and a bolt thrown on `step × stepSec` would then drift further out of
    // step with the pop it is supposed to land on with every column.
    const startAt: number[] = [];
    for (let i = 0; i < waves.length; i++) {
      if (i === 0) {
        startAt.push(0);
        continue;
      }
      const sameColumn = byWave.get(waves[i])![0].col === byWave.get(waves[i - 1])![0].col;
      startAt.push(startAt[i - 1] + (sameColumn ? (timing.rowStepSec ?? timing.stepSec) : timing.stepSec));
    }

    const startedAt = performance.now();
    if (staged.length > 0) {
      for (const bolt of staged) {
        const step = waves.indexOf(bolt.wave ?? 0);
        if (step < 0) continue;
        // The hold-off goes to the view, not to `_waitSec`. Sleeping on it here meant going
        // through `setTimeout`, which the browser floors at a few milliseconds: a sweep
        // spaced finer than that fired several volleys in the same frame and the cascade
        // read as one flash.
        void view.animateCookieBeams(gridId, bolt.from, bolt.targets, timing.beamSec, startAt[step]);
      }
      await this._waitSec(timing.beamSec);
    }

    // Bombs that survived the blast, waiting for the clear to actually reach them before
    // they start pulsing. Drained as the sweep passes their step.
    const pending = [...armed].sort((a, b) => a.wave - b.wave);
    for (let i = 0; i < waves.length; i++) {
      const step = byWave.get(waves[i])!;
      // How much of this step's slot is still ahead of us. Every visual gets it, because a
      // step shorter than the timer's floor puts several of them in one frame — the loop is
      // then already late and the effects would all start together.
      const behind = Math.max(0, startAt[i] - (performance.now() - startedAt) / 1000);
      // The bombs this step struck begin their pulse and open their blast gap here, not
      // when the clear was planned. `<=` rather than `===` because a surviving bomb's own
      // cell is out of the clear, so its wave need not be one the sweep stops on.
      while (pending.length > 0 && pending[0].wave <= waves[i]) {
        this._beginArmedPulse(gridId, pending.shift()!.itemId);
      }
      // With the step, not before the sweep. Shown up front it announced the whole clear at
      // once — every cell of the board lighting up while the cookie pair's bolts were still
      // on their way to the first column.
      //
      // One score for the MATCH itself, one per CELL for anything a booster took, so a
      // sweep or a blast shows what it actually touched.
      // How much of this step's slot is still ahead of us. Every visual gets it, because a
      // step shorter than the timer's floor puts several of them in one frame — the loop is
      // then already late and the effects would all start together.

      if (fromMatch && waves[i] === 0) {
        const middle = step[Math.floor(step.length / 2)];
        if (middle) view.showScoreText(gridId, [middle], behind);
      } else {
        view.showScoreText(gridId, step, behind);
      }
      // A flash of light on everything this step takes, over the pop itself.
      view.animatePopLight(gridId, step, behind);
      // The stripes THIS step fires throw their shockwave now, not when the clear was
      // planned. Read here rather than up front for two reasons: a stripe reached on a later
      // step should not have thrown already, and the gem has to still be standing to be read
      // at all — which it is, because the clear below is what takes it.
      this._playStripeWaves(gridId, step, behind);
      // Wave 0 within the call: these pop now, the stagger lives out here.
      void view.animateClearMatches(gridId, step.map((c) => ({ row: c.row, col: c.col })), behind);
      svc.clearMatchedCells(step);
      // Handed back the moment they are empty. A cell still ahead of the wave stays
      // claimed and stays solid, but one the wave has passed has nothing left to protect
      // — so the gems above it start down NOW instead of waiting for the far end of a
      // long sweep. Deleted from `owned` too, so the chain's own release cannot later
      // drop a claim another chain has since taken on the same cell.
      //
      // A fall here is REQUIRED, not an optimisation. Holding it until the sweep ended
      // left every gem above an already-emptied cell hanging over the hole for the rest
      // of the sweep — a booster about to fire, or a gem about to pop, sitting on nothing.
      //
      // Nor is it what made the fall unreadable before. That was two gravity passes
      // running at once off different snapshots of the board, and matches firing on gems
      // still in the air. Both are closed elsewhere now: gravity is applied by one
      // synchronous pass, and the chain waits for the whole board to be still before it
      // looks for a match — which is the only point a match is ever looked for.
      if (owned) {
        let freed = false;
        for (const c of step) {
          const k = this._cellKey(c.row, c.col);
          if (owned.delete(k)) {
            this._claimedCells.delete(k);
            freed = true;
          }
        }
        if (freed) this._requestFall(gridId);
      }
      const next = i + 1 < waves.length ? byWave.get(waves[i + 1]) : undefined;
      if (next) {
        // Down a column is a shorter beat than across to the next one, when a pace asks for
        // it. Read off the cells rather than off the wave numbers, so how a path chooses to
        // encode its order stays its own business.
        const sameColumn = next[0].col === step[0].col;
        const gap = sameColumn ? (timing.rowStepSec ?? timing.stepSec) : timing.stepSec;
        if (gap > 0) await this._waitSec(gap);
      }
    }
    // Anything left was struck beyond the last step the sweep stopped on — it has still
    // been struck, so it goes off now rather than never.
    for (const bomb of pending) this._beginArmedPulse(gridId, bomb.itemId);
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
   * Test aid: freezes the board the moment a special is created with nothing under it.
   *
   * A special is created in place and must then fall like any other gem. If it is left
   * hanging the fault is upstream of anything you can see — by the time it is obvious,
   * gems have fallen past it and the state that caused it is gone. Stopping the clock
   * here keeps that state on screen.
   */
  private _checkFloatingSpecial(at: Cell): void {
    const svc = this._operations;
    const cfg = this._config;
    if (!svc || !cfg || !cfg.debugPauseOnFloatingSpecial) return;

    const below = at.row + 1;
    if (!svc.isPlayable(below) || svc.itemIdAt(below, at.col) >= 0) return;

    // eslint-disable-next-line no-console
    console.warn(`[match3] special created in the air at row=${at.row} col=${at.col} — cell below is empty. Board frozen; match3.play() to resume.`);
    cfg.timeScale = 0;
  }

  /**
   * Whether this cell's gem already has a turn of its own booked — queued by a
   * combination, or a bomb with blasts left waiting out its pulse.
   *
   * Being kept out of the CLEAR was not enough for the armed bomb: another bomb's blast
   * reaching it still fired it, spending its second blast there and taking it off the
   * board, so the pulse and the blast it was waiting for never happened. In a converted
   * field every bomb did this to its neighbours and the whole board went at once.
   */
  private _isWaitingItsTurn(cell: Cell, viaColourClear = false): boolean {
    const itemId = this._operations?.itemIdAt(cell.row, cell.col) ?? -1;
    if (itemId < 0 || itemId === this._firingBooster) return false;
    // A cookie taking this gem's colour is a DIRECT hit, not a blast passing over it: an
    // armed bomb it reaches goes off now rather than seeing out the rest of its pulse. That
    // is the ordinary chain rule — a booster set off indirectly fires — and the pulse was
    // never meant to make it immune, only to keep another bomb's ring from spending its
    // turn for it. Left waiting here, a cookie would clear it and the blast it was
    // pulsing for would simply never happen.
    if (viaColourClear && this._boosterBlasts.has(itemId)) return false;
    return this._comboQueue.has(itemId) || this._boosterBlasts.has(itemId);
  }

  /**
   * Decides which bombs survive their own blast, and hands back both the cells to keep out
   * of the clear and the bombs whose pulse has yet to start.
   *
   * The DECISION has to be made up front — the clear set cannot be built without knowing
   * which cells are coming out of it — but nothing the player can see may start here. A
   * clear travels: a bomb on step three of a sweep is not struck until the sweep reaches
   * it, and starting its pulse and its blast timer at once had it blinking before the
   * cookie's bolts had left, then blasting again early because the gap had been running
   * the whole time. So the pulse and the timer are handed to {@link _sweepClearAsync},
   * which starts them as each step lands.
   */
  private _armSurvivingBoosters(fired: readonly SweepCell[]): { kept: Set<string>; armed: ArmedBomb[] } {
    const svc = this._operations;
    const cfg = this._config;
    const kept = new Set<string>();
    const armed: ArmedBomb[] = [];
    if (!svc || !cfg || fired.length === 0) return { kept, armed };

    for (const at of fired) {
      const itemId = svc.itemIdAt(at.row, at.col);
      if (itemId < 0) continue;
      const spent = (this._boosterBlasts.get(itemId) ?? 0) + 1;
      if (this._spendFully.delete(itemId) || spent >= Math.max(1, cfg.bomb.blasts)) {
        this._boosterBlasts.delete(itemId);
        continue;
      }
      // Recorded now, because this is what makes the bomb immune to everyone else's clear
      // while it waits. Only the pulse and the gap are deferred.
      this._boosterBlasts.set(itemId, spent);
      kept.add(this._cellKey(at.row, at.col));
      armed.push({ itemId, wave: at.wave });
    }
    return { kept, armed };
  }

  /** Starts a bomb pulsing and opens its gap — called when the clear actually reaches it. */
  private _beginArmedPulse(gridId: number, itemId: number): void {
    if (!this._boosterBlasts.has(itemId)) return;
    this._updateBlink(gridId);
    void this._scheduleNextBlastAsync(gridId, itemId);
  }

  /** The wait between one blast and the next, and then the next blast. */
  private async _scheduleNextBlastAsync(gridId: number, itemId: number): Promise<void> {
    const cfg = this._config;
    if (!cfg) return;

    await this._waitSec(cfg.bomb.blastGapSec);
    const at = this._findItem(itemId);
    if (!at) {
      // Something else cleared it while it waited. That is allowed; its turn lapses.
      this._boosterBlasts.delete(itemId);
      this._updateBlink(gridId);
      return;
    }
    this._firingBooster = itemId;
    try {
      this._detonateSpecial(gridId, at);
    } finally {
      this._firingBooster = null;
    }
    this._updateBlink(gridId);
  }

  /**
   * Gives back everything a clear took hold of but never used, when it turns out there is
   * nothing left for it to do — every cell already spoken for by another one.
   *
   * The bombs matter as much as the colours. A bomb's pulse and its blast gap are started by
   * the SWEEP, at the step that reaches it, so a bomb that was armed and then never handed
   * to a sweep pulsed for ever: the record was there, which made it immune to everyone
   * else's clear, but nothing existed to fire it. That is what stranded a bomb blinking
   * after a cookie combination — the combination fires its converted gems one at a time, and
   * one of them found every cell it wanted already claimed.
   */
  private _abandonClear(gridId: number, colours: number[], armed: ArmedBomb[]): void {
    this._dropColours(colours);
    for (const bomb of armed) this._beginArmedPulse(gridId, bomb.itemId);
  }

  /** Hands colours back when a clear is abandoned before a chain takes them on. */
  private _dropColours(colours: number[]): void {
    for (const c of colours) this._firingColours.delete(c);
  }

  /**
   * The shared pacing, for a clear that is not one of the combinations — an ordinary
   * match, or a single special going off on its own.
   */
  private _basePace(): ClearPace {
    const cfg = this._config;
    return { stepSec: cfg?.clear.stepSec ?? 0, beamSec: cfg?.cookie.beam.strikeSec ?? 0 };
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

  /**
   * Runs one clear, starting NOW.
   *
   * Deliberately not queued behind whatever else the board is doing. Queueing them was
   * tried and it is what left gems hanging: a clear claims its cells synchronously, before
   * its first await, and a claimed cell is solid to gravity — so a clear waiting its turn
   * pinned its gems in the air over cells that were already empty, for as long as the
   * chain ahead of it took. Clears therefore run concurrently and the board keeps flowing.
   *
   * The order that matters is kept elsewhere, and without holding anything up: gravity is
   * one synchronous pass ({@link _applyFall}), and a match is only ever looked for once
   * the whole board is still ({@link _waitBoardSettledAsync}).
   */
  private async _runChainAsync(
    gridId: number,
    cells: SweepCell[],
    specials: SpecialSpawn[] = [],
    bolts: CookieBolt[] = [],
    pace?: ClearPace,
    colours: number[] = [],
    fromMatch = false,
    armed: ArmedBomb[] = []
  ): Promise<void> {
    this._activeChains++;
    try {
      await this._runChainBodyAsync(gridId, cells, specials, bolts, pace, fromMatch, armed);
    } finally {
      // Whatever colour this chain was taking is fair game again.
      for (const c of colours) this._firingColours.delete(c);
      this._activeChains--;
      // Quiet board: the next move starts the pop pitch from the base note again.
      if (this._activeChains === 0) this._comboStep = 0;
    }
  }

  private async _runChainBodyAsync(
    gridId: number,
    cells: SweepCell[],
    specials: SpecialSpawn[] = [],
    bolts: CookieBolt[] = [],
    pace?: ClearPace,
    fromMatch = false,
    armed: ArmedBomb[] = []
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
      if (specials.length > 0) {
        for (const special of specials) {
          svc.createSpecial(special.row, special.col, special.gemType, special.special);
          view.animateSpecialSpawn(gridId, special);
          this._checkFloatingSpecial(special);
        }
        const promoted = new Set(specials.map((s) => this._cellKey(s.row, s.col)));
        wave = cells.filter((c) => !promoted.has(this._cellKey(c.row, c.col)));
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
      // The clear travels as a wave: each step is popped AND removed from the model
      // before the next begins, so nothing falls until the wave has passed over it.
      // Clearing the whole set at once and staggering only the visuals left the gems
      // dropping behind a line that was still on screen.
      await this._sweepClearAsync(
        gridId,
        wave,
        owned,
        bolts.filter((b) => b.wave !== undefined),
        timing,
        fromMatch,
        armed
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
    this._applyFall(gridId);
    await this._waitBoardSettledAsync();
    events.emitScoreChanged(this._gameModel!.score);
    events.emitGoalChanged(this._gameModel!.cleared, this._config!.goal);

    this._servicePendingBoosters(gridId);
    this._settle(gridId);
  }

  /**
   * Compacts the whole board and tops it up, then hands the result to the view — the one
   * place gravity is applied, so every caller gets the same rules.
   *
   * SYNCHRONOUS by design, and it is worth saying why. A cell that has just been emptied
   * must have the gem above it moving in the same instant; anything else leaves a gem
   * hanging over a hole, which is exactly what a staggered sweep or a booster's blast
   * shows off. So this returns as soon as the model has been compacted and the view has
   * been retargeted — the flight itself is integrated per frame and needs nobody to wait
   * on it. Callers that must not act until the board is still await
   * {@link _waitBoardSettledAsync} instead, and those are only the ones about to look for
   * a match.
   *
   * Cells another clear is still working through are solid to this pass. A staggered
   * clear takes several steps, and this is board-wide: without the barrier it would pull
   * gems into cells that clear has already popped but not finished with, and its
   * remaining steps would then take whatever slid in — the mess that showed up as soon
   * as two matches overlapped, and worst around a freshly made stripe.
   */
  /**
   * A fall pass, at most one per frame.
   *
   * {@link _applyFall} compacts and tops up the WHOLE board and rebuilds the object of every
   * gem it moves, so its cost is the board, not the cells that just cleared. The sweep now
   * has a step per cell rather than per column, and calling it on every step meant sixty-odd
   * full passes inside a second for a cookie pair — thousands of object rebuilds, which is
   * what made that combination stutter while ordinary matches were fine.
   *
   * Nothing is lost by coalescing them: no frame is drawn between two steps of the same
   * frame, so a second pass in that frame could not have been seen. The first request in a
   * frame runs at once — a hole must never be left open — and any others are folded into one
   * pass on the next.
   */
  private _requestFall(gridId: number): void {
    if (this._fallScheduled) return;
    const now = performance.now();
    if (now - this._lastFallAt >= GameBoardsViewController.FALL_MIN_MS) {
      this._lastFallAt = now;
      this._applyFall(gridId);
      return;
    }
    this._fallScheduled = true;
    requestAnimationFrame(() => {
      this._fallScheduled = false;
      this._lastFallAt = performance.now();
      this._applyFall(gridId);
    });
  }

  private _applyFall(gridId: number): void {
    const svc = this._operations;
    const view = this._gridsView;
    if (!svc || !view) return;

    const allCols = new Set(Array.from({ length: svc.cols }, (_, i) => i));
    // Nothing is captured beforehand any more. The view carries each gem's rendered
    // position across the object rebuild the grid does on every cell change, so gravity
    // can move whatever it likes here without the render position needing rescuing.
    const moves = svc.applyGravity(undefined, this._isCellClaimed);
    const spawns = svc.refillEmpty(undefined, this._isCellClaimed);
    // Only these come in from above. Anything else the view has not seen before was
    // created where it stands, and starts there.
    const spawnedIds = new Set(spawns.map((s) => svc.itemIdAt(s.row, s.col)).filter((id) => id >= 0));

    // Their destination cells hold the gems that are now in the air, so input stays
    // off them until they land.
    const inFlight = [
      ...moves.map((m) => this._cellKey(m.toRow, m.toCol)),
      ...spawns.map((s) => this._cellKey(s.row, s.col))
    ];
    for (const k of inFlight) this._animatingCells.add(k);
    // Not awaited — see the note above. The cells are released once these gems land, so
    // input stays off them for the flight without holding the caller up.
    void view.reconcileColumns(gridId, allCols, spawnedIds).finally(() => {
      for (const k of inFlight) this._animatingCells.delete(k);
    });
  }

  /**
   * Resolves once the whole board is still.
   *
   * The single gate the strict order rests on: a match is only ever looked for from here,
   * so nothing can fire on a gem that is still in the air. Deliberately separate from
   * {@link _applyFall} — gravity has to be immediate, waiting has to be explicit, and
   * fusing the two is what left gems hanging over cells a sweep had already emptied.
   */
  private async _waitBoardSettledAsync(): Promise<void> {
    await this._gridsView?.waitForBoardAtRestAsync();
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
