import { HexGrid, UnsubscribeBag, UpdateManager, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { HexCoord } from "../constants/HexCoord.js";
import type { SortMove } from "../constants/SortMove.js";
import { HexaSortConfig } from "../HexaSortConfig.js";
import { GameEvents } from "../events/GameEvents.js";
import { SortOperations } from "./SortOperations.js";
import { SfxService } from "../services/SfxService.js";
import { hexCellKey } from "./HexNeighbors.js";

type Phase = "idle" | "sorting" | "destroying" | "cooldown";

/**
 * Global, single-track placement-merge state manager with continuous
 * grid-wide propagation and deferred destruction.
 *
 * A *trigger queue* drives everything. A trigger is a cell to evaluate as
 * the placed cell of the next merge iteration. Triggers enter the queue
 * via three paths:
 *
 * 1. External: {@link enqueuePlacement} — player placed a stack.
 * 2. Post-sort rescan: after every merge iteration, every cell on the
 *    grid is scanned (in `(col, row)` order) and cells that currently
 *    have a matching neighbor are enqueued.
 * 3. Post-destruction rescan: after a cell's destruction completes, the
 *    same scan runs so the revealed top can seed new merges.
 *
 * **Rendering separation.** The manager mutates the model and plays the
 * SFX that are tied to domain steps, then emits
 * {@link GameEvents.onSortMoveStarted} / {@link GameEvents.onBlockDestroyStarted}
 * with plain `(col, row, color)` coordinates. It never imports view
 * types and never holds a view reference — the grid view controller
 * subscribes and translates events into view animations. Step cadence
 * is time-based and derived from the animation durations in
 * {@link HexaSortConfig}, so the manager advances in lockstep with the
 * view's tweens without needing a completion callback.
 *
 * Bound as a DI singleton.
 */
export class SortingManager implements IInjectionTarget {
  private _grid: HexGrid | null = null;
  private _config: HexaSortConfig | null = null;
  private _events: GameEvents | null = null;
  private _sfx: SfxService | null = null;

  private readonly _queue: HexCoord[] = [];
  private readonly _queuedKeys = new Set<number>();

  private _phase: Phase = "idle";

  // Current merge iteration state.
  private _mergeTarget: HexCoord | null = null;
  private _mergeColor: number | null = null;
  private _mergeSources: HexCoord[] = [];

  // Current destruction state.
  private _destroyCell: HexCoord | null = null;
  private _destroyColor: number | null = null;

  private _timeAccum = 0;

  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._grid = resolver.getInstance(HexGrid);
    this._config = resolver.getInstance(HexaSortConfig);
    this._events = resolver.getInstance(GameEvents);
    this._sfx = resolver.getInstance(SfxService);
    const updateManager = resolver.getInstance(UpdateManager);
    this._subs.add(updateManager.register((dt) => this._tick(dt)));
  }

  /** Queues a placement cell as a merge trigger. A running phase is never disturbed. */
  public enqueuePlacement(col: number, row: number): void {
    this._enqueueTrigger({ col, row });
    this._tryStartNext();
  }

  public destroy(): void {
    this._subs.flush();
    this._queue.length = 0;
    this._queuedKeys.clear();
    this._setIdle();
    this._grid = null;
    this._config = null;
    this._events = null;
    this._sfx = null;
  }

  // --- Tick driver --------------------------------------------------------

  private _tick(dtSeconds: number): void {
    if (!this._grid || !this._config) return;
    this._timeAccum += dtSeconds;
    while (this._timeAccum >= this._currentStepSeconds()) {
      this._timeAccum -= this._currentStepSeconds();
      this._fireStep();
    }
  }

  /**
   * Phase step durations bundle animation-run-time with the per-step
   * gap, so a single timer drives both "view is animating" and
   * "breathing room between steps". The view's gsap tween duration
   * matches the animation portion, so the two advance in lockstep.
   */
  private _currentStepSeconds(): number {
    const cfg = this._config;
    if (!cfg) return Number.POSITIVE_INFINITY;
    switch (this._phase) {
      case "sorting":
        return cfg.animSortMoveSeconds + cfg.sortStepSeconds;
      case "destroying":
        return cfg.animDestroyScaleSeconds + cfg.destructionStepSeconds;
      case "cooldown":
        return cfg.colorCooldownSeconds;
      default:
        return Number.POSITIVE_INFINITY;
    }
  }

  private _fireStep(): void {
    switch (this._phase) {
      case "sorting":
        this._onSortStep();
        return;
      case "destroying":
        this._onDestroyStep();
        return;
      case "cooldown":
        this._onCooldownElapsed();
        return;
      default:
        return;
    }
  }

  // --- Queue --------------------------------------------------------------

  private _enqueueTrigger(cell: HexCoord): void {
    const key = hexCellKey(cell.col, cell.row);
    if (this._queuedKeys.has(key)) return;
    this._queuedKeys.add(key);
    this._queue.push({ col: cell.col, row: cell.row });
  }

  private _dequeueTrigger(): HexCoord | null {
    const cell = this._queue.shift();
    if (!cell) return null;
    this._queuedKeys.delete(hexCellKey(cell.col, cell.row));
    return cell;
  }

  /** Scans the entire grid in `(col, row)` order and enqueues every cell with ≥1 matching neighbor. */
  private _rescanAndEnqueue(): void {
    if (!this._grid) return;
    for (let col = 0; col < this._grid.columnCount; col++) {
      for (let row = 0; row < this._grid.rowCount; row++) {
        if (SortOperations.findMatchingNeighbors(this._grid, col, row).length > 0) {
          this._enqueueTrigger({ col, row });
        }
      }
    }
  }

  // --- Phase transitions --------------------------------------------------

  /**
   * Peels off queued triggers until one yields a real merge iteration.
   * Empties the queue of no-op triggers; if none match, falls through to
   * destruction scan or idle.
   */
  private _tryStartNext(): void {
    if (this._phase !== "idle") return;
    while (this._queue.length > 0) {
      const trigger = this._dequeueTrigger()!;
      if (this._startMergeIteration(trigger)) {
        this._phase = "sorting";
        this._timeAccum = 0;
        return;
      }
    }
    this._enterDestructionOrIdle();
  }

  private _startMergeIteration(placed: HexCoord): boolean {
    if (!this._grid) return false;
    const top = SortOperations.getTopColor(this._grid, placed.col, placed.row);
    if (top === null) return false;
    const matches = SortOperations.findMatchingNeighbors(this._grid, placed.col, placed.row);
    if (matches.length === 0) return false;

    const target = matches.length === 1
      ? SortOperations.selectMergeTarget(this._grid, placed, matches[0]!)
      : placed;

    const sources: HexCoord[] = [];
    if (!SortingManager._sameCell(placed, target)) sources.push(placed);
    for (const m of matches) {
      if (!SortingManager._sameCell(m, target)) sources.push(m);
    }

    this._mergeTarget = target;
    this._mergeColor = top;
    this._mergeSources = sources;
    return true;
  }

  /** Queue empty + no merge possible anywhere → check destruction, else go idle. */
  private _enterDestructionOrIdle(): void {
    if (!this._grid || !this._config) {
      this._setIdle();
      return;
    }
    const candidates = SortOperations.findDestructionCandidates(this._grid, this._config.destructionThreshold);
    const cell = candidates[0] ?? null;
    if (cell) {
      const color = SortOperations.getTopColor(this._grid, cell.col, cell.row);
      if (color !== null) {
        this._destroyCell = cell;
        this._destroyColor = color;
        this._phase = "destroying";
        this._timeAccum = 0;
        return;
      }
    }
    this._setIdle();
  }

  private _setIdle(): void {
    this._phase = "idle";
    this._mergeTarget = null;
    this._mergeColor = null;
    this._mergeSources = [];
    this._destroyCell = null;
    this._destroyColor = null;
    this._timeAccum = 0;
  }

  private _enterCooldown(): void {
    this._phase = "cooldown";
    this._timeAccum = 0;
  }

  // --- Sort steps --------------------------------------------------------

  private _onSortStep(): void {
    const move = this._pickNextMergeMove();
    if (!move) {
      this._onMergeIterationDone();
      return;
    }
    this._startSortMove(move);
  }

  /** First pending source whose top still matches `_mergeColor`. */
  private _pickNextMergeMove(): SortMove | null {
    if (!this._grid || !this._mergeTarget || this._mergeColor === null) return null;
    for (const source of this._mergeSources) {
      if (SortOperations.getTopColor(this._grid, source.col, source.row) === this._mergeColor) {
        return { source, target: this._mergeTarget, color: this._mergeColor };
      }
    }
    return null;
  }

  private _startSortMove(move: SortMove): void {
    if (!this._grid || !this._events) return;
    const popped = this._grid.removeCellItem(move.source.col, move.source.row);
    if (!popped) return;
    // Reuse the popped item; its back-reference was cleared by removeCellItem.
    this._grid.addCellItem(move.target.col, move.target.row, popped);

    // SFX tied to the domain step; landing SFX is fired by the view
    // controller when the tween completes (tied to the rendered motion).
    this._sfx?.playMoveStart();

    this._events.emitSortMoveStarted(
      move.source.col,
      move.source.row,
      move.target.col,
      move.target.row,
      move.color,
    );
  }

  private _onMergeIterationDone(): void {
    this._mergeTarget = null;
    this._mergeColor = null;
    this._mergeSources = [];
    // Grid-wide re-evaluation: every merge operation triggers a full scan
    // so matches created anywhere on the board become triggers.
    this._rescanAndEnqueue();
    this._enterCooldown();
  }

  private _onCooldownElapsed(): void {
    this._phase = "idle";
    this._tryStartNext();
  }

  // --- Destruction steps -------------------------------------------------

  private _onDestroyStep(): void {
    if (!this._grid) {
      this._onDestructionIterationDone();
      return;
    }
    const cell = this._destroyCell;
    const color = this._destroyColor;
    if (!cell || color === null) {
      this._onDestructionIterationDone();
      return;
    }
    if (SortOperations.getTopColor(this._grid, cell.col, cell.row) !== color) {
      this._onDestructionComplete();
      return;
    }
    this._startDestroyStep(cell);
  }

  private _startDestroyStep(cell: HexCoord): void {
    if (!this._grid || !this._events) return;
    this._grid.removeCellItem(cell.col, cell.row);
    // SFX 3: one pop per destroyed tile — fires at the start of each
    // destruction step, so rapid cascades sound as a natural burst.
    this._sfx?.playTileDestroy();
    this._events.emitBlockDestroyStarted(cell.col, cell.row);
  }

  private _onDestructionComplete(): void {
    const cell = this._destroyCell;
    this._destroyCell = null;
    this._destroyColor = null;
    // The destroyed cell's revealed top may form new matches — enqueue it
    // first so the rescan's deterministic (col, row) order still treats
    // it as a primary trigger, then rescan for any other newly valid cells.
    if (cell) this._enqueueTrigger(cell);
    this._onDestructionIterationDone();
  }

  private _onDestructionIterationDone(): void {
    this._destroyCell = null;
    this._destroyColor = null;
    this._rescanAndEnqueue();
    this._enterCooldown();
  }

  // --- Helpers -----------------------------------------------------------

  private static _sameCell(a: HexCoord, b: HexCoord): boolean {
    return a.col === b.col && a.row === b.row;
  }
}
