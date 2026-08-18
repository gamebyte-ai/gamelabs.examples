import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IHudView } from "../views/IHudView";
import { SortExpressConfig } from "../SortExpressConfig";
import { GameplayEvents } from "../events/GameplayEvents";

/**
 * Drives the countdown: accumulates elapsed time off the UpdateManager tick and
 * pushes the remaining fraction (1 → 0) to the HUD bar. Starts immediately when
 * `countdown.autoStart`, otherwise on the gameplay `start` event. Stops at zero.
 */
export class HudViewController implements IViewController<IHudView> {
  private _view: IHudView | null = null;
  private _updateManager: UpdateManager | null = null;
  private _config: SortExpressConfig | null = null;
  private _events: GameplayEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  private _elapsed = 0;
  private _running = false;
  private _broomRemaining = 0;
  private _shuffleRemaining = 0;
  /** Seconds since the last tap anywhere — resets on interaction, shows the end
   * card once it crosses `idle.seconds`. */
  private _idleElapsed = 0;
  /** The end card is shown at most once (win / lose / idle / debug all go here). */
  private _endShown = false;

  /** Any tap anywhere resets the idle timer. */
  private readonly _onInteract = (): void => {
    this._idleElapsed = 0;
  };

  public inject(resolver: IInstanceResolver): void {
    this._updateManager = resolver.getInstance(UpdateManager);
    this._config = resolver.getInstance(SortExpressConfig);
    this._events = resolver.getInstance(GameplayEvents);
  }

  public initialize(view: IHudView): void {
    this._view = view;
    const duration = Math.max(0.001, this._config!.countdown.durationSeconds);
    view.setTime(duration, 1);

    if (this._config!.countdown.autoStart) this._running = true;
    else this._subs.add(this._events!.onStart(() => (this._running = true)));

    this._subs.add(this._updateManager!.register((dt) => this._tick(dt)));
    // Reset the idle timer on any tap anywhere (capture, so it always sees it).
    window.addEventListener("pointerdown", this._onInteract, true);
    // Terminal results (from the board, mutually exclusive): stop the clock, show
    // the matching banner + the end card (CTA).
    this._subs.add(
      this._events!.onWin(() => {
        this._running = false;
        this._view?.showWin();
        this._showEndCard();
      }),
    );
    this._subs.add(
      this._events!.onLose(() => {
        this._running = false;
        this._view?.showTimeout();
        this._showEndCard();
      }),
    );

    // Dev shortcut: jump straight to the end card on load.
    if (this._config!.debug.openEndScreen) this._showEndCard();
    // Broom booster: init the count badge; a tap fires the broom (only while any
    // are left); the count decrements when a sweep ACTUALLY ran (onBroomUsed).
    this._broomRemaining = this._config!.booster.count.count;
    view.setBroomCount(this._broomRemaining);
    this._subs.add(
      view.onBroom(() => {
        if (this._broomRemaining > 0) this._events?.emitBroom(view.broomScreenNdc());
      }),
    );
    this._subs.add(
      this._events!.onBroomUsed(() => {
        this._broomRemaining = Math.max(0, this._broomRemaining - 1);
        this._view?.setBroomCount(this._broomRemaining);
      }),
    );
    // Shuffle booster: init the count; a tap fires it (only while any are left);
    // the count decrements + hat animation plays once the board confirms it started.
    this._shuffleRemaining = this._config!.booster.shuffle.count;
    view.setShuffleCount(this._shuffleRemaining);
    this._subs.add(
      view.onShuffle(() => {
        if (this._shuffleRemaining > 0) this._events?.emitShuffle();
      }),
    );
    this._subs.add(
      this._events!.onShuffleStarted((ndc) => {
        this._shuffleRemaining = Math.max(0, this._shuffleRemaining - 1);
        this._view?.setShuffleCount(this._shuffleRemaining);
        this._view?.playShuffle(ndc);
      }),
    );
  }

  private _tick(dt: number): void {
    // Idle → end card: runs regardless of the countdown state.
    const idle = this._config!.idle;
    if (idle.enabled && !this._endShown) {
      this._idleElapsed += dt;
      if (this._idleElapsed >= idle.seconds) this._showEndCard();
    }

    if (!this._running) return;
    const duration = Math.max(0.001, this._config!.countdown.durationSeconds);
    this._elapsed = Math.min(duration, this._elapsed + dt);
    const remaining = duration - this._elapsed;
    this._view?.setTime(remaining, remaining / duration);
    if (this._elapsed >= duration) {
      this._running = false; // clock expired — the board decides win/lose (deferred
      this._events?.emitTimeout(); // until any match/broom animation settles)
    }
  }

  /** Show the end card at most once (win / lose / idle / debug all route here).
   * Also stops the countdown + freezes the board (idempotent for win/lose, which
   * already froze). */
  private _showEndCard(): void {
    if (this._endShown) return;
    this._endShown = true;
    this._running = false; // stop the countdown
    this._events?.emitEndCard(); // freeze board interaction
    this._view?.showEndCard();
  }

  public destroy(): void {
    window.removeEventListener("pointerdown", this._onInteract, true);
    this._subs.flush();
    this._view = null;
    this._updateManager = null;
    this._config = null;
    this._events = null;
  }
}
