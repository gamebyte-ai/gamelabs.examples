import { TimelineManager, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { BUBBLE_COLORS, BubbleColor, isPowerUpColor } from "../constants/BubbleColor";
import type { PowerUpKind } from "../constants/PowerUpKind";
import { GameEvents } from "../events/GameEvents";
import { BubbleGrid } from "../models/BubbleGrid";
import { Shooter } from "../models/Shooter";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { BubbleGridLayout } from "./BubbleGridLayout";
import type { IAimLanding, IAimTrajectory, IAimTrajectorySegment } from "../models/IAimTrajectory";
import { AimTrajectoryCalculator } from "./AimTrajectoryCalculator";
import { MatchFinder, type IMatchedCell } from "./MatchFinder";
import { FloatingBubbleFinder } from "./FloatingBubbleFinder";
import { Score } from "../models/Score";
import { LEVELS } from "../constants/Levels";
import { PowerUpCountBumpTrack } from "./PowerUpCountBumpTrack";

const EMPTY_TRAJECTORY: IAimTrajectory = { segments: [], end: "none", landing: null };

interface IFlyingBubbleState {
  /** Colour of the in-flight bubble. `null` when {@link isBomb} is true. */
  readonly color: BubbleColor | null;
  /** Bomb power-up flight; `_completeFlight` runs the explosion path instead of a snap. */
  readonly isBomb: boolean;
  readonly segments: readonly IAimTrajectorySegment[];
  readonly segLengths: readonly number[];
  readonly segDirX: readonly number[];
  readonly segDirY: readonly number[];
  readonly landing: IAimLanding;
  segmentIndex: number;
  traveledInSegment: number;
}

interface IFallingBubbleState {
  readonly id: number;
  readonly color: BubbleColor;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface IFireballState {
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
}


/**
 * Coordinates writes to the {@link BubbleGrid} and {@link Shooter} models
 * and announces them via {@link GameEvents}.
 *
 * Step 4 adds the firing state machine: {@link fire} kicks the held
 * bubble onto a precomputed trajectory; {@link update} advances it each
 * frame; on completion the bubble snaps into the cell shown by the
 * landing preview, the next bubble loads, and aim resumes from the
 * latest cursor position.
 */
export class GameOperations implements IInjectionTarget {
  private _config: BubbleShooterConfig | null = null;
  private _layout: BubbleGridLayout | null = null;
  private _grid: BubbleGrid | null = null;
  private _shooter: Shooter | null = null;
  private _events: GameEvents | null = null;
  private _aimCalculator: AimTrajectoryCalculator | null = null;
  private _matchFinder: MatchFinder | null = null;
  private _floatingFinder: FloatingBubbleFinder | null = null;
  private _score: Score | null = null;
  private _timeline: TimelineManager | null = null;

  private _state: "idle" | "flying" | "popping" | "flying-fireball" | "swapping" = "idle";
  private _swapTimer = 0;
  private _flying: IFlyingBubbleState | null = null;
  private _fireball: IFireballState | null = null;
  private _popQueue: IMatchedCell[] = [];
  private _popTimer = 0;
  /** Per-pop-session counter used to compute the (n+1)·popPointsStep score per bubble. */
  private _popIndexInSession = 0;
  /** Disconnected bubbles in mid-fall. Lives independently of the main state machine. */
  private _falling: IFallingBubbleState[] = [];
  private _nextFallingId = 0;
  /** Remaining bomb power-ups. Decremented on bomb fire, refilled at level start. */
  private _bombCount = 0;
  /** Remaining fireball power-ups. Decremented on fireball fire. */
  private _fireballCount = 0;
  /**
   * Input lock — true the moment the grid clears (well before the win
   * message is allowed to show). Disables every input so the player
   * can't fire / swap / pop a power-up during the falling-bubble
   * wind-down.
   */
  private _isWon = false;
  /**
   * Final win latch — true once the grid is empty AND every falling
   * bubble has finished. Gates the win message + the public game-won
   * event so it doesn't appear over still-falling debris.
   */
  private _winLatched = false;
  /**
   * Loss latch — true the moment any bubble's cell touches shooter
   * level. Disables every input and emits `onGameOverChanged(true)`;
   * mutually exclusive with the win flow.
   */
  private _isLost = false;
  /**
   * Descending-ceiling counter — increments at the end of each
   * resolved shot. When it reaches
   * {@link BubbleShooterConfig.shotsPerDescend}, the grid descends
   * one row pitch and the counter resets.
   */
  private _shotsSinceDescend = 0;
  /**
   * Held bubble colour at the moment a power-up was activated —
   * restored when the player cancels (right-click or clicks the
   * power-up button again). `null` means there's no power-up
   * currently held, OR the player had an empty held slot when
   * they activated. Cleared on fire (the next bubble flows in
   * via `_promoteNextBubble`) and on level reset.
   */
  private _preHeldColor: BubbleColor | null = null;
  /**
   * Number of in-flight power-up collections — incremented when we
   * register a `PowerUpCountBumpTrack` and decremented when its
   * `onArrived` callback fires. Used to gate the win-latch so the
   * "YOU WIN" message can't pop up while a collection icon is still
   * mid-flight (the arrival event also bumps the badge count, which
   * the player visually expects to see before the win screen).
   */
  private _inFlightCollections = 0;
  private _lastAimX = 0;
  private _lastAimY = 0;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._layout = resolver.getInstance(BubbleGridLayout);
    this._grid = resolver.getInstance(BubbleGrid);
    this._shooter = resolver.getInstance(Shooter);
    this._events = resolver.getInstance(GameEvents);
    this._aimCalculator = resolver.getInstance(AimTrajectoryCalculator);
    this._matchFinder = resolver.getInstance(MatchFinder);
    this._floatingFinder = resolver.getInstance(FloatingBubbleFinder);
    this._score = resolver.getInstance(Score);
    this._timeline = resolver.getInstance(TimelineManager);
  }

  /** Build the default level, load shooter held + next, point straight up. */
  public start(): void {
    this.loadLevel("level-1");
    this._initShooterBubbles();
    const layout = this._layout!;
    this.aimAt(layout.shooterX, layout.shooterY + 1);
  }

  public buildInitialLayout(): void {
    const grid = this._grid!;
    const events = this._events!;
    const filledRows = Math.max(0, grid.rowCount - this._config!.initialEmptyBottomRows);
    for (let row = 0; row < filledRows; row++) {
      const colCount = grid.getColumnCount(row);
      for (let col = 0; col < colCount; col++) {
        const color = this._pickColor(row, col);
        grid.setColor(row, col, color);
        events.emitBubblePlaced(row, col, color);
      }
    }
  }

  /**
   * Reset the grid to the layout of the given level. Cancels any
   * in-flight / popping / falling state and resets the score so the
   * test scenario starts from a clean slate.
   */
  public loadLevel(levelId: string): void {
    const level = LEVELS.find((l) => l.id === levelId);
    if (!level) return;

    this._cancelTransientState();
    this._clearGrid();

    // Apply per-level layout changes lazily: the WIDTH override
    // happens up front (it changes the grid shape and column
    // counts), but the DESCEND offset is computed *after*
    // placements so the bottom of the cluster always lines up at
    // the same visual row regardless of how many rows the level
    // defines. A single `onLayoutChanged` emit at the end covers
    // both — the view snaps its visual state in one pass. The
    // `onGridDescended` event is reserved for IN-GAME single-row
    // descents (which animate); level loads must NOT animate.
    let layoutChanged = false;

    const targetWidth = level.wideRowColumns ?? this._config!.wideRowColumns;
    if (targetWidth !== this._layout!.wideRowColumns) {
      this._layout!.setWideRowColumns(targetWidth);
      this._grid!.rebuild();
      layoutChanged = true;
    }

    if (level.placements === null) {
      this.buildInitialLayout();
    } else {
      const grid = this._grid!;
      const events = this._events!;
      for (const p of level.placements) {
        grid.setColor(p.row, p.col, p.color);
        events.emitBubblePlaced(p.row, p.col, p.color);
      }
    }

    // Stone overrides go on AFTER the colour fill so they can sit
    // anywhere — including cells the procedural fill just placed.
    if (level.stoneCells) {
      const grid = this._grid!;
      const events = this._events!;
      for (const sc of level.stoneCells) {
        grid.setColor(sc.row, sc.col, BubbleColor.Stone);
        events.emitBubblePlaced(sc.row, sc.col, BubbleColor.Stone);
      }
    }

    // Power-up seeding goes LAST so bombs / fireballs can land on
    // any colour cell the previous steps placed (but never overwrite
    // a stone — the stone marker stays where the level set it).
    if (level.randomPowerUps) {
      this._placeRandomPowerUps(level.randomPowerUps.bombs, level.randomPowerUps.fireballs);
    }

    // Auto-position the cluster: pin the lowest occupied row to the
    // same visual row index the auto-descent-after-pop logic targets,
    // so every level starts with the same distance between the
    // bottom of the cluster and the shooter / lose-line. Empty
    // levels stay at descend 0 (top of viewport).
    const lowestRow = this._findLowestOccupiedRow();
    const targetDescend =
      lowestRow >= 0 ? this._config!.clusterBottomTargetRowsFromTop - 1 - lowestRow : 0;
    if (targetDescend !== this._layout!.descendOffsetRows) {
      this._layout!.setDescendOffsetRows(targetDescend);
      layoutChanged = true;
    }

    if (layoutChanged) this._events!.emitLayoutChanged();
    this._shotsSinceDescend = 0;

    this._score!.reset();
    this._events!.emitScoreChanged(0);
    this._bombCount = this._config!.initialBombCount;
    this._events!.emitBombCountChanged(this._bombCount);
    this._fireballCount = this._config!.initialFireballCount;
    this._events!.emitFireballCountChanged(this._fireballCount);
    if (this._isWon) {
      this._isWon = false;
      this._events!.emitShooterControlsLocked(false);
    }
    if (this._winLatched) {
      this._winLatched = false;
      this._events!.emitGameWonChanged(false);
    }
    if (this._isLost) {
      this._isLost = false;
      this._events!.emitGameOverChanged(false);
      this._events!.emitShooterControlsLocked(false);
    }
    this._emitPowerUpAvailability();
    // Re-roll the shooter's held + next slots against the new
    // level's palette. Skipping this leaves stale colours from the
    // previous level — and worse, if the previous level had ended
    // (grid emptied), `_validateShooterColors` had already nulled
    // both slots, so the next level would start with nothing to
    // fire and `fire()` would silently bail.
    this._initShooterBubbles();
    this.aimAt(this._lastAimX, this._lastAimY);
  }

  /**
   * Pick `bombs + fireballs` random occupied non-stone cells and
   * overwrite each with the matching power-up colour, with the
   * constraint that no two power-up cells end up hex-adjacent. Cells
   * are sampled uniformly without replacement; the first valid pick
   * for each requested slot wins, and any candidate touching an
   * already-placed power-up is skipped. If the grid runs out of
   * non-adjacent eligible cells before the request is satisfied, the
   * remainder is silently dropped. Called once per level load.
   */
  private _placeRandomPowerUps(bombs: number, fireballs: number): void {
    if (bombs + fireballs <= 0) return;
    const grid = this._grid!;
    const layout = this._layout!;
    const events = this._events!;
    interface ICell { row: number; col: number }
    const candidates: ICell[] = [];
    for (let row = 0; row < grid.rowCount; row++) {
      const cols = grid.getColumnCount(row);
      for (let col = 0; col < cols; col++) {
        const c = grid.getColor(row, col);
        // Skip empty + stone cells — power-ups overwrite a regular
        // colour bubble so the cluster topology stays connected.
        if (c === null || c === BubbleColor.Stone) continue;
        candidates.push({ row, col });
      }
    }
    // Full Fisher-Yates so adjacency-rejected picks fall back to
    // arbitrary positions in the shuffled list.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i]!;
      candidates[i] = candidates[j]!;
      candidates[j] = tmp;
    }

    const hasPowerUpNeighbour = (row: number, col: number): boolean => {
      for (const off of layout.getNeighborOffsets(row)) {
        const nr = row + off.dRow;
        const nc = col + off.dCol;
        if (!layout.isInBounds(nr, nc)) continue;
        if (isPowerUpColor(grid.getColor(nr, nc))) return true;
      }
      return false;
    };

    let placedBombs = 0;
    let placedFireballs = 0;
    for (const cell of candidates) {
      if (placedBombs === bombs && placedFireballs === fireballs) break;
      if (hasPowerUpNeighbour(cell.row, cell.col)) continue;
      const colour = placedBombs < bombs ? BubbleColor.Bomb : BubbleColor.Fireball;
      grid.setColor(cell.row, cell.col, colour);
      events.emitBubblePlaced(cell.row, cell.col, colour);
      if (colour === BubbleColor.Bomb) placedBombs++;
      else placedFireballs++;
    }
  }

  /**
   * Authoritative gate for the bomb / fireball OSC buttons: enabled
   * only when the player has stock AND the controls aren't locked
   * (win latch / loss latch). Called from every code path that can
   * change inventory or lock state so the controller never has to
   * mirror these fields.
   */
  private _emitPowerUpAvailability(): void {
    const unlocked = !this._isWon && !this._isLost;
    this._events!.emitPowerUpAvailabilityChanged(unlocked && this._bombCount > 0, unlocked && this._fireballCount > 0);
  }

  /**
   * Combined "any power-up loaded" boolean for the aim line tint —
   * red while a bomb or fireball is held, white otherwise. Called
   * from every code path that flips bomb / fireball mode so the
   * view layer never has to OR the two booleans itself.
   */
  private _emitAimPowerUpMode(): void {
    const shooter = this._shooter;
    if (!shooter) return;
    this._events!.emitAimPowerUpModeChanged(shooter.isBomb || shooter.isFireball);
  }

  /**
   * Hook called at the end of each fully-resolved shot (regular
   * snap, cluster pop completion, bomb explosion, fireball exit).
   * Two paths:
   *
   * - **Pop shot** (`poppedAny = true`): leave the dry-shot
   *   counter unchanged (pops neither advance nor reset it) and
   *   run the auto-descent check — if the cluster has shrunk too
   *   far upward, the grid slides down to keep the play area
   *   populated.
   * - **Non-pop shot**: advance the dry-shot counter; on the
   *   third consecutive non-pop, descend by one row and reset.
   */
  private _onShotResolved(poppedAny: boolean): void {
    if (this._isWon || this._isLost) return;
    if (poppedAny) {
      this._maybeAutoDescend();
      return;
    }
    this._shotsSinceDescend++;
    if (this._shotsSinceDescend < this._config!.shotsPerDescend) return;
    this._shotsSinceDescend = 0;
    this._descendBy(1);
  }

  /**
   * Descending-ceiling step. Advances the layout's logical descend
   * offset by `rows`, fires the event with the row count so the
   * view can stack the animation, and re-runs the loss check (a
   * descent might push an existing bubble across the lose line).
   */
  private _descendBy(rows: number): void {
    if (rows <= 0) return;
    const layout = this._layout!;
    layout.setDescendOffsetRows(layout.descendOffsetRows + rows);
    this._events!.emitGridDescended(rows);
    this._checkLoss();
  }

  /**
   * Auto-descent after a successful pop: locate the lowest
   * occupied row in the grid model and bring it down to the
   * configured target visual row from the top. With descent `D`
   * applied, the model's row `R` displays at visual row index
   * `R + D` (0-indexed) from the grid origin, so to pin row R at
   * visual row `(target - 1)` we need `D_target = target - 1 - R`.
   * Only descends if more rows are needed than currently applied —
   * we never anti-descend (a too-low cluster keeps its position).
   */
  private _maybeAutoDescend(): void {
    const lowestRow = this._findLowestOccupiedRow();
    if (lowestRow < 0) return;
    const desiredDescend = this._config!.clusterBottomTargetRowsFromTop - 1 - lowestRow;
    const additional = desiredDescend - this._layout!.descendOffsetRows;
    if (additional <= 0) return;
    this._descendBy(additional);
  }

  /**
   * Highest model-row index that holds an occupied cell, or `-1`
   * when the grid is empty. Used by both the level-load auto-
   * positioning and the post-pop auto-descent.
   */
  private _findLowestOccupiedRow(): number {
    const grid = this._grid!;
    for (let row = grid.rowCount - 1; row >= 0; row--) {
      const cols = grid.getColumnCount(row);
      for (let col = 0; col < cols; col++) {
        if (grid.isOccupied(row, col)) return row;
      }
    }
    return -1;
  }

  /** Wipe transient flight / pop / falling / bomb / fireball state and notify the view. */
  private _cancelTransientState(): void {
    const events = this._events!;
    if (this._flying) {
      if (this._flying.isBomb) events.emitFlyingBombChanged(false, 0, 0);
      else events.emitFlyingBubbleChanged(null, 0, 0);
      this._flying = null;
    }
    if (this._fireball) {
      events.emitFireballChanged(false, 0, 0);
      this._fireball = null;
    }
    this._popQueue.length = 0;
    this._popTimer = 0;
    this._popIndexInSession = 0;
    for (const f of this._falling) events.emitFallingBubbleChanged(f.id, null, f.x, f.y);
    this._falling.length = 0;
    // Drop in-flight power-up collection bumps. The TimelineManager's
    // own cancellation (via `cancelByType("powerup-count-bump")`)
    // fires each track's `onCancel` (a silent no-op) and removes them
    // from the model — see `PowerUpCountBumpTrack`. We zero the
    // counter so a transient cancel mid-collection doesn't leave the
    // win-latch permanently gated.
    this._timeline?.cancelByType("powerup-count-bump");
    this._inFlightCollections = 0;
    let modeChanged = false;
    if (this._shooter?.isBomb) {
      this._shooter.setIsBomb(false);
      events.emitShooterBombChanged(false);
      modeChanged = true;
    }
    if (this._shooter?.isFireball) {
      this._shooter.setIsFireball(false);
      events.emitShooterFireballChanged(false);
      modeChanged = true;
    }
    if (modeChanged) this._emitAimPowerUpMode();
    // Level reset wipes any saved pre-power-up colour — the new
    // level reinitialises the held slot via `_initShooterBubbles`.
    this._preHeldColor = null;
    this._state = "idle";
  }

  private _clearGrid(): void {
    const grid = this._grid!;
    const events = this._events!;
    for (let row = 0; row < grid.rowCount; row++) {
      const colCount = grid.getColumnCount(row);
      for (let col = 0; col < colCount; col++) {
        if (grid.isOccupied(row, col)) {
          grid.setColor(row, col, null);
          events.emitBubbleRemoved(row, col);
        }
      }
    }
  }

  /**
   * Swap held ↔ next. Blocked while a bubble is in flight (which also
   * covers the synchronous pop / drop phase since state only flips back
   * to idle after _completeFlight finishes).
   */
  public swap(): void {
    if (this._isWon || this._isLost) return;
    if (this._state !== "idle") return;
    const shooter = this._shooter!;
    // Right-click + the swap-icon click both feed this. If a
    // power-up is loaded, swap input cancels it (restoring the
    // pre-power-up colour) instead of trying to swap a null held
    // slot — the user's "right-click cancels" affordance.
    if (shooter.isBomb || shooter.isFireball) {
      this._cancelPowerUp();
      return;
    }
    const a = shooter.heldColor;
    const b = shooter.nextColor;
    if (a === null || b === null) return;
    // Mutate the model directly (skip `_setHeldColor` / `_setNextColor`
    // so we don't emit the per-slot colour-changed events). The view
    // gets a single coordinated `onShooterSwap` event and applies
    // materials atomically when its position-swap animation finishes.
    shooter.setHeldColor(b);
    shooter.setNextColor(a);
    this._state = "swapping";
    this._swapTimer = this._config!.shooterSwapDurationSeconds;
    this._events!.emitShooterSwap(b, a);
  }

  private _initShooterBubbles(): void {
    // `_randomColor` returns null when only stones (or nothing) remain
    // on the grid; the held / next slots show empty in that case.
    this._setHeldColor(this._randomColor());
    this._setNextColor(this._randomColor());
  }

  /**
   * Promote next → held and generate a fresh next. Called immediately on
   * fire, so during flight the shooter already shows the upcoming colour
   * (firing stays blocked until the in-flight bubble snaps).
   */
  private _promoteNextBubble(): void {
    const next = this._shooter!.nextColor ?? this._randomColor();
    this._setHeldColor(next);
    this._setNextColor(this._randomColor());
  }

  private _setHeldColor(color: BubbleColor | null): void {
    this._shooter!.setHeldColor(color);
    this._events!.emitShooterColorChanged(color);
  }

  private _setNextColor(color: BubbleColor | null): void {
    this._shooter!.setNextColor(color);
    this._events!.emitShooterNextColorChanged(color);
  }

  /**
   * Pick a colour from those currently present on the grid (excluding
   * stones). Returns `null` when no colour bubbles remain — at that
   * point the held / next slots show empty and the game is winding
   * down toward the win condition.
   */
  private _randomColor(): BubbleColor | null {
    const present = this._collectPresentColors();
    if (present.length === 0) return null;
    return present[Math.floor(Math.random() * present.length)]!;
  }

  private _collectPresentColors(): BubbleColor[] {
    const grid = this._grid!;
    const set = new Set<BubbleColor>();
    for (let row = 0; row < grid.rowCount; row++) {
      const cols = grid.getColumnCount(row);
      for (let col = 0; col < cols; col++) {
        const c = grid.getColor(row, col);
        // Stones and power-up cells are not playable shooter colours.
        if (c !== null && c !== BubbleColor.Stone && !isPowerUpColor(c)) set.add(c);
      }
    }
    return [...set];
  }

  private _isGridEmpty(): boolean {
    const grid = this._grid!;
    for (let row = 0; row < grid.rowCount; row++) {
      const cols = grid.getColumnCount(row);
      for (let col = 0; col < cols; col++) {
        if (grid.isOccupied(row, col)) return false;
      }
    }
    return true;
  }

  /**
   * Two-stage win check. Stage 1 fires the moment the grid empties:
   * locks shooter controls (so the player can't activate power-ups
   * during the fall-out wait) but leaves any falling bubbles to play
   * out. Stage 2 latches the win — and emits the public game-won
   * event — only once the grid is empty *and* every falling bubble
   * has finished, so the win message never appears over still-moving
   * debris. Re-entered from {@link _updateFalling} when the last fall
   * resolves.
   */
  private _checkWin(): void {
    if (this._winLatched) return;
    if (!this._isGridEmpty()) return;
    if (!this._isWon) {
      this._isWon = true;
      this._events!.emitShooterControlsLocked(true);
      this._emitPowerUpAvailability();
    }
    // Defer the win latch until both falling bubbles AND in-flight
    // power-up collections have finished — otherwise the win message
    // can pop up over a still-flying collection icon.
    if (this._falling.length > 0) return;
    if (this._inFlightCollections > 0) return;
    this._winLatched = true;
    this._events!.emitGameWonChanged(true);
  }

  /**
   * Loss check. Fires the moment any occupied bubble's BOTTOM
   * EDGE touches or crosses {@link BubbleGridLayout.loseLineY} —
   * the visible line just above the shooter. The bottom edge is
   * the cell centre minus a bubble radius, so the comparison is
   * `cell.y - r ≤ loseLineY`, i.e. `cell.y ≤ loseLineY + r`.
   * Checking by edge (not centre) means a bubble whose bottom
   * touches the line triggers loss immediately, not the
   * stack-position later when its centre drops past the line.
   * Mirrors the win lock: emits `onShooterControlsLocked(true)`
   * and `onGameOverChanged(true)`. Idempotent and mutually
   * exclusive with the win flow.
   */
  private _checkLoss(): void {
    if (this._isLost) return;
    if (this._winLatched || this._isWon) return;
    const grid = this._grid!;
    const layout = this._layout!;
    const threshold = layout.loseLineY + layout.bubbleRadius;
    let reached = false;
    outer: for (let row = 0; row < grid.rowCount; row++) {
      const cols = grid.getColumnCount(row);
      for (let col = 0; col < cols; col++) {
        if (!grid.isOccupied(row, col)) continue;
        if (layout.getCellWorldPosition(row, col).y <= threshold) {
          reached = true;
          break outer;
        }
      }
    }
    if (!reached) return;
    this._isLost = true;
    this._events!.emitAimTrajectoryChanged(EMPTY_TRAJECTORY);
    this._events!.emitShooterControlsLocked(true);
    this._events!.emitGameOverChanged(true);
    this._emitPowerUpAvailability();
  }

  /**
   * Re-roll the held / next slots if their colour is no longer present
   * on the grid. Run after every pop sequence so the player can never
   * end up holding a colour that's been fully cleared.
   */
  private _validateShooterColors(): void {
    const present = new Set(this._collectPresentColors());
    const held = this._shooter!.heldColor;
    const next = this._shooter!.nextColor;
    if (held !== null && !present.has(held)) this._setHeldColor(this._randomColor());
    if (next !== null && !present.has(next)) this._setNextColor(this._randomColor());
  }

  /**
   * Point the shooter at a world position. Always remembers the latest
   * coordinates so we can resume aim after a flight ends. Trajectory
   * emission is suppressed while a bubble is in flight — the aim line
   * and landing preview stay hidden until the bubble snaps.
   *
   * When the cursor is below the shooter's centre, aiming is disabled:
   * the shooter freezes at its last valid angle and the aim line +
   * landing preview hide. {@link fire} likewise refuses while disabled.
   */
  public aimAt(worldX: number, worldY: number): void {
    if (this._isWon || this._isLost) return;
    this._lastAimX = worldX;
    this._lastAimY = worldY;

    const layout = this._layout!;
    const config = this._config!;

    if (worldY < layout.shooterY) {
      if (this._state === "idle") this._events!.emitAimTrajectoryChanged(EMPTY_TRAJECTORY);
      return;
    }

    const dx = worldX - layout.shooterX;
    const dy = worldY - layout.shooterY;
    if (dx === 0 && dy === 0) return;

    const minAngle = config.aimMinAngleFromHorizontalRad;
    const maxAngle = Math.PI - minAngle;
    let angle = Math.atan2(dy, dx);
    if (!Number.isFinite(angle)) return;
    if (angle < minAngle) angle = minAngle;
    if (angle > maxAngle) angle = maxAngle;

    this._shooter!.setAimAngle(angle);
    this._events!.emitShooterAimChanged(angle);

    if (this._state !== "idle") return;
    // Three trajectory modes per held-slot kind:
    //   - regular bubble: full grid (visible + hidden) is collision
    //     space, snap must be cluster-connected, side walls bounce.
    //   - bomb: visible cells only (blast stays in viewport), side
    //     walls bounce, snap can be any close empty cell.
    //   - fireball: straight line, no bounces, no landing snap —
    //     mirrors the actual fireball flight.
    const shooter = this._shooter!;
    const trajectory = shooter.isFireball
      ? this._aimCalculator!.computeStraightLine(angle)
      : this._aimCalculator!.compute(angle, {
          onlyVisible: shooter.isBomb,
          requireConnection: !shooter.isBomb,
        });
    this._events!.emitAimTrajectoryChanged(trajectory);
  }

  /**
   * Fire the currently-held bubble. Quietly ignored unless we're idle,
   * have a held colour, and the current aim resolves to a reachable
   * landing cell. Loads the next bubble onto the shooter immediately so
   * the player sees it during flight; the new bubble can't fire until
   * the in-flight bubble snaps.
   */
  public fire(): void {
    if (this._isWon || this._isLost) return;
    if (this._state !== "idle") return;
    // Aim disabled while the cursor is below the shooter centre.
    if (this._lastAimY < this._layout!.shooterY) return;
    const shooter = this._shooter!;
    const isBomb = shooter.isBomb;
    const isFireball = shooter.isFireball;
    const heldColor = shooter.heldColor;
    // Fireball flight bypasses the trajectory / snap pipeline entirely.
    if (isFireball) {
      this._fireFireball();
      return;
    }
    // Either a coloured held bubble or a bomb power-up must be loaded.
    if (!isBomb && heldColor === null) return;

    // Power-up projectiles (bomb) only see visible cells; regular
    // bubbles see the full grid so they snap to the cluster even
    // when its upper rows are off-screen, and must land connected
    // (cluster-adjacent or row 0) so they never float free after
    // a descent.
    const trajectory = this._aimCalculator!.compute(shooter.aimAngle, {
      onlyVisible: isBomb,
      requireConnection: !isBomb,
    });
    if (trajectory.segments.length === 0 || trajectory.landing === null) return;

    const segLengths: number[] = [];
    const segDirX: number[] = [];
    const segDirY: number[] = [];
    for (const seg of trajectory.segments) {
      const dx = seg.toX - seg.fromX;
      const dy = seg.toY - seg.fromY;
      const len = Math.hypot(dx, dy);
      segLengths.push(len);
      segDirX.push(len === 0 ? 0 : dx / len);
      segDirY.push(len === 0 ? 0 : dy / len);
    }

    this._flying = {
      color: isBomb ? null : heldColor,
      isBomb,
      segments: trajectory.segments,
      segLengths,
      segDirX,
      segDirY,
      landing: trajectory.landing,
      segmentIndex: 0,
      traveledInSegment: 0,
    };
    this._state = "flying";

    // Aim line off; landing preview off.
    this._events!.emitAimTrajectoryChanged(EMPTY_TRAJECTORY);
    // Push the flying visual to its starting position.
    const start = trajectory.segments[0]!;
    if (isBomb) {
      this._events!.emitFlyingBombChanged(true, start.fromX, start.fromY);
      // Bomb consumed — decrement the inventory and clear bomb mode so
      // the new bubble can flow into the held slot.
      shooter.setIsBomb(false);
      this._events!.emitShooterBombChanged(false);
      this._bombCount = Math.max(0, this._bombCount - 1);
      this._events!.emitBombCountChanged(this._bombCount);
      this._emitPowerUpAvailability();
      this._emitAimPowerUpMode();
      // Pre-power-up colour is no longer reachable — the next bubble
      // flows in via `_promoteNextBubble` and there's no path back
      // to the saved colour after a successful fire.
      this._preHeldColor = null;
    } else {
      this._events!.emitFlyingBubbleChanged(heldColor, start.fromX, start.fromY);
      this._events!.emitBubbleShotFired();
    }
    // Promote next → held and generate a fresh next; firing stays
    // blocked until snap.
    this._promoteNextBubble();
  }

  /**
   * Load a bomb power-up into the shooter's held slot, replacing the
   * current held colour. Quietly ignored unless we're idle and bomb
   * mode isn't already on. The held colour is discarded — fire to use
   * the bomb, then the next bubble flows in normally.
   */
  public activateBomb(): void {
    if (this._isWon || this._isLost) return;
    if (this._state !== "idle") return;
    const shooter = this._shooter!;
    // Toggle: clicking the bomb button while bomb is held cancels
    // it and restores the pre-power-up regular bubble.
    if (shooter.isBomb) {
      this._cancelPowerUp();
      return;
    }
    if (this._bombCount <= 0) return;
    // Save the held colour only when transitioning from a regular
    // shot into a power-up. Switching between power-ups
    // (fireball → bomb) keeps the original pre-power-up colour
    // intact so cancel still restores it.
    if (!shooter.isFireball) {
      this._preHeldColor = shooter.heldColor;
    }
    if (shooter.isFireball) {
      shooter.setIsFireball(false);
      this._events!.emitShooterFireballChanged(false);
    }
    this._setHeldColor(null);
    shooter.setIsBomb(true);
    this._events!.emitShooterBombChanged(true);
    this._emitAimPowerUpMode();
  }

  /**
   * Load a fireball power-up into the shooter's held slot. Same idle /
   * inventory rules as {@link activateBomb}; clears any active bomb
   * first since the two power-ups share the held slot. Toggles —
   * a second click cancels and restores the pre-power-up bubble.
   */
  public activateFireball(): void {
    if (this._isWon || this._isLost) return;
    if (this._state !== "idle") return;
    const shooter = this._shooter!;
    if (shooter.isFireball) {
      this._cancelPowerUp();
      return;
    }
    if (this._fireballCount <= 0) return;
    if (!shooter.isBomb) {
      this._preHeldColor = shooter.heldColor;
    }
    if (shooter.isBomb) {
      shooter.setIsBomb(false);
      this._events!.emitShooterBombChanged(false);
    }
    this._setHeldColor(null);
    shooter.setIsFireball(true);
    this._events!.emitShooterFireballChanged(true);
    this._emitAimPowerUpMode();
  }

  /**
   * Cancel any active power-up: clear bomb / fireball mode, restore
   * the pre-power-up held colour, re-aim so the trajectory
   * recomputes for regular-bubble mode (different `onlyVisible` /
   * `requireConnection` flags). The power-up's inventory count is
   * not deducted on activation, so cancellation is a clean no-op
   * for inventory.
   */
  private _cancelPowerUp(): void {
    const shooter = this._shooter;
    if (!shooter) return;
    let cleared = false;
    if (shooter.isBomb) {
      shooter.setIsBomb(false);
      this._events!.emitShooterBombChanged(false);
      cleared = true;
    }
    if (shooter.isFireball) {
      shooter.setIsFireball(false);
      this._events!.emitShooterFireballChanged(false);
      cleared = true;
    }
    if (!cleared) return;
    this._setHeldColor(this._preHeldColor);
    this._preHeldColor = null;
    this._emitAimPowerUpMode();
    this.aimAt(this._lastAimX, this._lastAimY);
  }

  public update(dt: number): void {
    // Falling bubbles tick every frame regardless of state — the
    // pipeline is independent of flight / pop / swap. Power-up
    // collection timing now lives on `TimelineManager`
    // (see `PowerUpCountBumpTrack`) so there's no extra tick here.
    if (this._falling.length > 0) this._updateFalling(dt);

    if (this._state === "swapping") {
      this._swapTimer -= dt;
      if (this._swapTimer <= 0) {
        this._swapTimer = 0;
        this._state = "idle";
      }
      return;
    }
    if (this._state === "popping") {
      this._updatePopping(dt);
      return;
    }
    if (this._state === "flying-fireball") {
      this._updateFireball(dt);
      return;
    }
    if (this._state !== "flying" || !this._flying) return;
    const config = this._config!;
    let remaining = config.firedBubbleSpeed * dt;

    while (remaining > 0 && this._flying.segmentIndex < this._flying.segments.length) {
      const idx = this._flying.segmentIndex;
      const segLen = this._flying.segLengths[idx]!;
      const segLeft = segLen - this._flying.traveledInSegment;
      if (remaining < segLeft) {
        this._flying.traveledInSegment += remaining;
        remaining = 0;
      } else {
        remaining -= segLeft;
        this._flying.segmentIndex++;
        this._flying.traveledInSegment = 0;
      }
    }

    if (this._flying.segmentIndex >= this._flying.segments.length) {
      this._completeFlight();
      return;
    }

    const idx = this._flying.segmentIndex;
    const seg = this._flying.segments[idx]!;
    const x = seg.fromX + this._flying.segDirX[idx]! * this._flying.traveledInSegment;
    const y = seg.fromY + this._flying.segDirY[idx]! * this._flying.traveledInSegment;
    if (this._flying.isBomb) {
      this._events!.emitFlyingBombChanged(true, x, y);
    } else {
      this._events!.emitFlyingBubbleChanged(this._flying.color, x, y);
    }
  }

  private _completeFlight(): void {
    if (!this._flying) return;
    const { landing, color, isBomb } = this._flying;
    const events = this._events!;

    // Bomb path: skip the snap-into-grid step, hide the flying bomb,
    // and run the synchronous explosion.
    if (isBomb) {
      events.emitFlyingBombChanged(false, 0, 0);
      this._flying = null;
      this._explodeBomb(landing);
      return;
    }

    // Below the bomb branch the bubble is always coloured.
    if (color === null) return;
    const grid = this._grid!;
    grid.setColor(landing.row, landing.col, color);
    events.emitBubblePlaced(landing.row, landing.col, color);
    events.emitFlyingBubbleChanged(null, 0, 0);
    events.emitBubbleSnapped(landing.row, landing.col);

    const group = this._matchFinder!.findConnectedGroup(landing.row, landing.col);
    this._flying = null;

    if (group.length >= this._config!.matchPopThreshold) {
      // Sequential pop with score and particle burst per bubble. The
      // pop driver advances in `update(dt)`; floating-bubble drop runs
      // once the queue empties.
      this._popQueue = group.slice();
      this._popTimer = 0;
      this._popIndexInSession = 0;
      this._state = "popping";
      return;
    }

    this._state = "idle";
    this._checkLoss();
    if (this._isLost) return;
    // Snap without forming a popping cluster — counts as a non-pop
    // shot toward the descent threshold.
    this._onShotResolved(false);
    if (this._isLost) return;
    this.aimAt(this._lastAimX, this._lastAimY);
  }

  /**
   * Detonate a bomb at the given landing cell. Pops every occupied cell
   * within `bombBlastRingCount` hex rings around the centre at once —
   * no popping queue, all bursts fire on the same frame. Standard
   * post-pop logic (floating-bubble drop, score, re-aim) runs after.
   */
  private _explodeBomb(landing: IAimLanding): void {
    const grid = this._grid!;
    const layout = this._layout!;
    const events = this._events!;
    const config = this._config!;

    const targets = this._collectBombBlastCells(landing.row, landing.col, config.bombBlastRingCount);

    events.emitBombExploded();

    // Power-up effects are confined to the visible play area —
    // hidden upper-row bubbles must not be affected. Anything at
    // or below the visible cutoff (centre within one bubble radius
    // of `topWallY`) counts as visible.
    const visibleCutoff = layout.topWallY + layout.bubbleRadius;

    // Same per-cell scoring rule as cluster pops (5/10/15/...). Reset
    // the session counter so each bomb starts at index 1.
    this._popIndexInSession = 0;
    for (const cell of targets) {
      const color = grid.getColor(cell.row, cell.col);
      if (color === null) continue;
      // Power-up cells survive direct bomb hits — adjacency
      // collection picks them up via the neighbour scan below.
      if (isPowerUpColor(color)) continue;
      const pos = layout.getCellWorldPosition(cell.row, cell.col);
      if (pos.y > visibleCutoff) continue;
      this._popIndexInSession++;
      const points = this._popIndexInSession * config.popPointsStep;
      this._score!.add(points);
      events.emitScoreChanged(this._score!.value);
      events.emitBubblePopped(pos.x, pos.y, color, points);
      grid.setColor(cell.row, cell.col, null);
      events.emitBubbleRemoved(cell.row, cell.col);
      this._collectAdjacentPowerUps(cell.row, cell.col);
    }

    // Reuse the floating-drop machinery so disconnected chunks fall
    // exactly like they do after a normal cluster pop.
    this._spawnFallingForFloating();
    this._state = "idle";
    this._validateShooterColors();
    this._checkWin();
    if (this._isWon) return;
    // Bomb counts as a pop shot if it actually destroyed any cells.
    this._onShotResolved(this._popIndexInSession > 0);
    if (this._isLost) return;
    this.aimAt(this._lastAimX, this._lastAimY);
  }

  /**
   * Fire a fireball: a straight-line projectile that pops every
   * cluster bubble its centre passes within
   * `fireballCollisionRadius` of, and continues until it exits the
   * play area. Walls are ignored — the fireball plows straight through.
   */
  private _fireFireball(): void {
    const layout = this._layout!;
    const config = this._config!;
    const shooter = this._shooter!;
    const events = this._events!;

    const angle = shooter.aimAngle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const speed = config.fireballSpeed;
    const startX = layout.shooterX + dirX * config.shooterRadius;
    const startY = layout.shooterY + dirY * config.shooterRadius;

    this._fireball = { x: startX, y: startY, vx: dirX * speed, vy: dirY * speed };
    this._state = "flying-fireball";
    // Reset per-pop session so this fireball's pops start at index 1
    // (= 5 points), matching cluster + bomb scoring conventions.
    this._popIndexInSession = 0;

    events.emitAimTrajectoryChanged(EMPTY_TRAJECTORY);
    events.emitFireballChanged(true, startX, startY);
    events.emitFireballFired();

    // Clear held-slot fireball mode + decrement inventory + flow next
    // bubble in, mirroring the bomb fire path.
    shooter.setIsFireball(false);
    events.emitShooterFireballChanged(false);
    this._fireballCount = Math.max(0, this._fireballCount - 1);
    events.emitFireballCountChanged(this._fireballCount);
    this._emitPowerUpAvailability();
    this._emitAimPowerUpMode();
    // Pre-power-up colour is no longer reachable after a fire —
    // see the matching note in the bomb fire path.
    this._preHeldColor = null;
    this._promoteNextBubble();
  }

  private _updateFireball(dt: number): void {
    const f = this._fireball;
    if (!f) return;
    const config = this._config!;
    const layout = this._layout!;
    const grid = this._grid!;
    const events = this._events!;

    f.x += f.vx * dt;
    f.y += f.vy * dt;
    events.emitFireballChanged(true, f.x, f.y);

    // Pop every visible occupied cell whose centre is within
    // collision radius of the fireball's current position. Hidden
    // upper-row bubbles are excluded — power-ups only affect the
    // visible play area.
    const r = config.fireballCollisionRadius;
    const r2 = r * r;
    const visibleCutoff = layout.topWallY + layout.bubbleRadius;
    for (let row = 0; row < grid.rowCount; row++) {
      const cols = grid.getColumnCount(row);
      for (let col = 0; col < cols; col++) {
        if (!grid.isOccupied(row, col)) continue;
        const cell = layout.getCellWorldPosition(row, col);
        if (cell.y > visibleCutoff) continue;
        const dx = cell.x - f.x;
        const dy = cell.y - f.y;
        if (dx * dx + dy * dy <= r2) this._popOneCell({ row, col });
      }
    }

    // Exit check: a margin past the play-area extents so the fireball
    // visibly clears the frame before vanishing.
    const halfW = layout.halfAreaWidth + config.bubbleRadius;
    const halfH = layout.halfAreaHeight + config.bubbleRadius;
    if (f.x < -halfW || f.x > halfW || f.y > halfH || f.y < -halfH) {
      this._endFireball();
    }
  }

  private _endFireball(): void {
    this._events!.emitFireballChanged(false, 0, 0);
    this._fireball = null;
    // Standard post-pop logic — disconnected chunks fall + pop on the
    // threshold, score keeps accumulating per the falling-pop rule.
    this._spawnFallingForFloating();
    this._state = "idle";
    this._validateShooterColors();
    this._checkWin();
    if (this._isWon) return;
    // Fireball counts as a pop shot if its straight-line flight
    // popped at least one cluster cell.
    this._onShotResolved(this._popIndexInSession > 0);
    if (this._isLost) return;
    this.aimAt(this._lastAimX, this._lastAimY);
  }

  /**
   * BFS the hex grid out to `ringCount` from `(centerRow, centerCol)`,
   * collecting every in-bounds cell. ringCount=1 → 7 cells (centre + 6
   * neighbours); ringCount=2 → 19 cells; etc. Out-of-bounds neighbours
   * are skipped but never re-expanded, so an explosion near the edge of
   * the board doesn't wrap around.
   */
  private _collectBombBlastCells(centerRow: number, centerCol: number, ringCount: number): IMatchedCell[] {
    const layout = this._layout!;
    const visited = new Set<string>();
    const result: IMatchedCell[] = [];
    const key = (r: number, c: number): string => `${r}|${c}`;

    let frontier: IMatchedCell[] = [];
    if (layout.isInBounds(centerRow, centerCol)) {
      visited.add(key(centerRow, centerCol));
      result.push({ row: centerRow, col: centerCol });
      frontier.push({ row: centerRow, col: centerCol });
    }

    for (let depth = 1; depth <= ringCount; depth++) {
      const next: IMatchedCell[] = [];
      for (const cur of frontier) {
        for (const off of layout.getNeighborOffsets(cur.row)) {
          const nr = cur.row + off.dRow;
          const nc = cur.col + off.dCol;
          const k = key(nr, nc);
          if (visited.has(k)) continue;
          visited.add(k);
          if (!layout.isInBounds(nr, nc)) continue;
          result.push({ row: nr, col: nc });
          next.push({ row: nr, col: nc });
        }
      }
      frontier = next;
    }
    return result;
  }

  private _updatePopping(dt: number): void {
    this._popTimer -= dt;
    while (this._popTimer <= 0 && this._popQueue.length > 0) {
      const cell = this._popQueue.shift()!;
      this._popOneCell(cell);
      this._popTimer += this._config!.popDelaySeconds;
    }
    if (this._popQueue.length === 0) this._finishPopping();
  }

  private _popOneCell(cell: IMatchedCell): void {
    const grid = this._grid!;
    const events = this._events!;
    const layout = this._layout!;
    const color = grid.getColor(cell.row, cell.col);
    if (color === null) return;
    // Power-up cells aren't popped by direct hits — fireball passes
    // and individual cluster pops never destroy them. Adjacency
    // collection (called below) is what removes them from the grid.
    if (isPowerUpColor(color)) return;

    this._popIndexInSession++;
    const points = this._popIndexInSession * this._config!.popPointsStep;
    this._score!.add(points);
    events.emitScoreChanged(this._score!.value);

    const pos = layout.getCellWorldPosition(cell.row, cell.col);
    events.emitBubblePopped(pos.x, pos.y, color, points);
    grid.setColor(cell.row, cell.col, null);
    events.emitBubbleRemoved(cell.row, cell.col);
    this._collectAdjacentPowerUps(cell.row, cell.col);
  }

  /**
   * Scan the six hex neighbours of `(row, col)` and trigger a
   * collection for every Bomb / Fireball cell among them. Each
   * collection clears the cell synchronously, so a cluster pop where
   * the same power-up sits adjacent to two popped bubbles only
   * collects it once (the second neighbour's scan finds an empty
   * cell). Safe to call from every pop site — cluster pop, bomb
   * blast, fireball pass.
   */
  private _collectAdjacentPowerUps(row: number, col: number): void {
    const grid = this._grid!;
    const layout = this._layout!;
    for (const off of layout.getNeighborOffsets(row)) {
      const nr = row + off.dRow;
      const nc = col + off.dCol;
      if (!layout.isInBounds(nr, nc)) continue;
      const color = grid.getColor(nr, nc);
      if (!isPowerUpColor(color)) continue;
      this._collectPowerUpAt(nr, nc, color);
    }
  }

  /**
   * Remove a power-up cell from the grid and start its flight
   * animation. The matching inventory bump + `count-changed` event
   * fire later when the {@link PowerUpCountBumpTrack} reaches the
   * end of its duration — the spec requires the badge to tick up
   * exactly when the visual icon arrives at the button. The view
   * spawns its own `PowerUpFlightTrack` against the same duration
   * so both timelines end on the same frame.
   */
  private _collectPowerUpAt(row: number, col: number, color: BubbleColor): void {
    const grid = this._grid!;
    const layout = this._layout!;
    const events = this._events!;
    const timeline = this._timeline;
    if (!timeline) return;
    const pos = layout.getCellWorldPosition(row, col);
    grid.setColor(row, col, null);
    events.emitBubbleRemoved(row, col);
    const kind: PowerUpKind = color === BubbleColor.Bomb ? "bomb" : "fireball";
    this._inFlightCollections++;
    timeline.add(
      new PowerUpCountBumpTrack(kind, this._config!.powerUpCollectDurationSeconds, this._onCollectionArrived),
    );
    events.emitPowerUpCollected(kind, pos.x, pos.y);
  }

  /**
   * Bumps the matching inventory + emits the count event when a
   * `PowerUpCountBumpTrack` reaches the end of its duration. Also
   * re-enters `_checkWin` so a collection finishing after the grid
   * emptied + falling bubbles cleared can still latch the win.
   */
  private readonly _onCollectionArrived = (kind: PowerUpKind): void => {
    const events = this._events;
    if (!events) return;
    if (kind === "bomb") {
      this._bombCount++;
      events.emitBombCountChanged(this._bombCount);
    } else {
      this._fireballCount++;
      events.emitFireballCountChanged(this._fireballCount);
    }
    this._emitPowerUpAvailability();
    this._inFlightCollections = Math.max(0, this._inFlightCollections - 1);
    if (this._isWon && !this._winLatched && this._falling.length === 0 && this._inFlightCollections === 0) {
      this._checkWin();
    }
  };

  private _finishPopping(): void {
    this._spawnFallingForFloating();
    this._state = "idle";
    this._validateShooterColors();
    this._checkWin();
    if (this._isWon) return;
    // Cluster pop always destroyed at least `matchPopThreshold`
    // cells (the bubble + its match group), so this is a pop shot.
    this._onShotResolved(true);
    if (this._isLost) return;
    this.aimAt(this._lastAimX, this._lastAimY);
  }

  /**
   * Detect floating cells, remove them from the grid, and spawn falling
   * visuals with an outward radial impulse from the group's centre of
   * mass. Shared by cluster-pop completion and bomb-explosion
   * completion.
   */
  private _spawnFallingForFloating(): void {
    const grid = this._grid!;
    const layout = this._layout!;
    const events = this._events!;
    const config = this._config!;
    const floating = this._floatingFinder!.findFloating();

    // Snapshot positions + colours BEFORE removing anything so we can
    // compute the group's centre of mass (drives the outward impulse).
    interface IPending {
      row: number;
      col: number;
      color: BubbleColor;
      x: number;
      y: number;
    }
    const pending: IPending[] = [];
    let cx = 0;
    let cy = 0;
    for (const cell of floating) {
      const color = grid.getColor(cell.row, cell.col);
      if (color === null) continue;
      // Disconnected power-up bubbles fly straight to their button
      // (rule b) instead of joining the falling-bubble physics.
      if (isPowerUpColor(color)) {
        this._collectPowerUpAt(cell.row, cell.col, color);
        continue;
      }
      const pos = layout.getCellWorldPosition(cell.row, cell.col);
      pending.push({ row: cell.row, col: cell.col, color, x: pos.x, y: pos.y });
      cx += pos.x;
      cy += pos.y;
    }
    if (pending.length > 0) {
      cx /= pending.length;
      cy /= pending.length;
    }

    const impulse = config.fallingBubbleSeparationImpulse;
    const upBias = config.fallingBubbleSeparationUpBias;
    for (const p of pending) {
      grid.setColor(p.row, p.col, null);
      events.emitBubbleRemoved(p.row, p.col);

      // Outward direction from the group's centre — gives each bubble a
      // brief "scattering" beat before gravity overtakes the impulse.
      // A bubble exactly at the centre gets a random direction so a
      // single-cell drop still nudges visibly.
      let dx = p.x - cx;
      let dy = p.y - cy;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) {
        const a = Math.random() * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a);
      } else {
        dx /= len;
        dy /= len;
      }
      const vx = dx * impulse;
      const vy = dy * impulse + upBias;

      const id = this._nextFallingId++;
      this._falling.push({ id, color: p.color, x: p.x, y: p.y, vx, vy });
      events.emitFallingBubbleChanged(id, p.color, p.x, p.y);
    }
  }

  private _updateFalling(dt: number): void {
    const config = this._config!;
    const layout = this._layout!;
    const events = this._events!;
    // Falling-bubble pops fire at the lose-line — same Y reference
    // as the loss check, so the threshold tracks any tuning of
    // `loseLineDistanceFromShooter` automatically.
    const popY = layout.loseLineY;
    const gravity = config.fallingBubbleGravity;
    const leftWall = layout.leftWallX;
    const rightWall = layout.rightWallX;

    const remaining: IFallingBubbleState[] = [];
    for (const f of this._falling) {
      f.vy -= gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Bounce off the play-area side walls. Clamp first so a fast
      // bubble can't tunnel past in a single frame, then flip vx only
      // when actually moving into the wall (avoids re-triggering on
      // the next frame after a bounce).
      if (f.x < leftWall && f.vx < 0) {
        f.x = leftWall;
        f.vx = -f.vx;
      } else if (f.x > rightWall && f.vx > 0) {
        f.x = rightWall;
        f.vx = -f.vx;
      }

      if (f.y <= popY) {
        // Every falling bubble (including stones) awards the same
        // points and emits the standard burst.
        const points = config.fallingBubblePopPoints;
        this._score!.add(points);
        events.emitScoreChanged(this._score!.value);
        events.emitBubblePopped(f.x, f.y, f.color, points);
        events.emitFallingBubbleChanged(f.id, null, f.x, f.y);
        continue;
      }
      events.emitFallingBubbleChanged(f.id, f.color, f.x, f.y);
      remaining.push(f);
    }
    this._falling = remaining;
    // Stage-2 win re-entry: if the last fall just finished and the
    // grid is empty, this latches the win and shows the message.
    if (this._falling.length === 0 && this._isWon) this._checkWin();
  }

  /**
   * Deterministic colour pick for a varied non-striped pattern. Mixing
   * row-and-column primes plus a per-row-band offset breaks the diagonal
   * runs you'd otherwise see from a pure `(row + col) % N` scheme.
   */
  private _pickColor(row: number, col: number): BubbleColor {
    const palette = BUBBLE_COLORS;
    const hash = row * 31 + col * 53 + Math.floor(row / 2) * 11 + (col & 1) * 17;
    const index = ((hash % palette.length) + palette.length) % palette.length;
    return palette[index]!;
  }
}
