import type { Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Gameplay flow event channel. The game screen (HUD) emits `start` on the
 * tap-to-start tap; the game flow will listen and kick off the first round.
 */
export class GameplayEvents {
  private readonly _startListeners = new Set<() => void>();
  private readonly _timeoutListeners = new Set<() => void>();
  private readonly _loseListeners = new Set<() => void>();
  private readonly _endCardListeners = new Set<() => void>();
  private readonly _winListeners = new Set<() => void>();
  private readonly _broomListeners = new Set<(ndc: { x: number; y: number }) => void>();
  private readonly _broomUsedListeners = new Set<() => void>();
  private readonly _shuffleListeners = new Set<() => void>();
  private readonly _shuffleStartedListeners = new Set<(ndc: { x: number; y: number }) => void>();

  public onStart(cb: () => void): Unsubscribe {
    this._startListeners.add(cb);
    return () => this._startListeners.delete(cb);
  }

  public emitStart(): void {
    for (const cb of this._startListeners) cb();
  }

  /** Fired when the countdown reaches zero (raw signal; the terminal loss is
   * decided by the board once animations settle — see {@link onLose}). */
  public onTimeout(cb: () => void): Unsubscribe {
    this._timeoutListeners.add(cb);
    return () => this._timeoutListeners.delete(cb);
  }

  public emitTimeout(): void {
    for (const cb of this._timeoutListeners) cb();
  }

  /** Fired once when the game is LOST (time ran out, board unsolved, animations
   * settled). Terminal + mutually exclusive with {@link onWin}. */
  public onLose(cb: () => void): Unsubscribe {
    this._loseListeners.add(cb);
    return () => this._loseListeners.delete(cb);
  }

  public emitLose(): void {
    for (const cb of this._loseListeners) cb();
  }

  /** Fired when the end card is shown (win / lose / idle) — the board freezes
   * interaction on this so nothing is draggable behind the card. */
  public onEndCard(cb: () => void): Unsubscribe {
    this._endCardListeners.add(cb);
    return () => this._endCardListeners.delete(cb);
  }

  public emitEndCard(): void {
    for (const cb of this._endCardListeners) cb();
  }

  /** Fired once when the board is fully cleared (the player wins). */
  public onWin(cb: () => void): Unsubscribe {
    this._winListeners.add(cb);
    return () => this._winListeners.delete(cb);
  }

  public emitWin(): void {
    for (const cb of this._winListeners) cb();
  }

  /** Fired when the broom booster button is tapped — carries the button's screen
   * NDC so the board flies the items to under it. */
  public onBroom(cb: (ndc: { x: number; y: number }) => void): Unsubscribe {
    this._broomListeners.add(cb);
    return () => this._broomListeners.delete(cb);
  }

  public emitBroom(ndc: { x: number; y: number }): void {
    for (const cb of this._broomListeners) cb(ndc);
  }

  /** Fired when the shuffle booster button is tapped. */
  public onShuffle(cb: () => void): Unsubscribe {
    this._shuffleListeners.add(cb);
    return () => this._shuffleListeners.delete(cb);
  }

  public emitShuffle(): void {
    for (const cb of this._shuffleListeners) cb();
  }

  /** Fired when a shuffle ACTUALLY started (board accepted it) — carries the gather
   * point in screen NDC so the HUD can place the hat over it. */
  public onShuffleStarted(cb: (ndc: { x: number; y: number }) => void): Unsubscribe {
    this._shuffleStartedListeners.add(cb);
    return () => this._shuffleStartedListeners.delete(cb);
  }

  public emitShuffleStarted(ndc: { x: number; y: number }): void {
    for (const cb of this._shuffleStartedListeners) cb(ndc);
  }

  /** Fired when a broom sweep ACTUALLY ran (3 items found) — the count decrements
   * on this, not on every tap, so a no-op tap doesn't waste a use. */
  public onBroomUsed(cb: () => void): Unsubscribe {
    this._broomUsedListeners.add(cb);
    return () => this._broomUsedListeners.delete(cb);
  }

  public emitBroomUsed(): void {
    for (const cb of this._broomUsedListeners) cb();
  }
}
