import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IBoardView } from "../views/IBoardView";
import { GameplayEvents } from "../events/GameplayEvents";

/** Drives the board's per-frame update (drag lerp) off the UpdateManager tick,
 * and freezes interaction when the countdown times out. */
export class BoardViewController implements IViewController<IBoardView> {
  private _view: IBoardView | null = null;
  private _updateManager: UpdateManager | null = null;
  private _events: GameplayEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._updateManager = resolver.getInstance(UpdateManager);
    this._events = resolver.getInstance(GameplayEvents);
  }

  public initialize(view: IBoardView): void {
    this._view = view;
    this._subs.add(this._updateManager!.register((dt) => this._view?.update(dt)));
    // Clock hit 0 → let the board resolve the result once animations settle.
    this._subs.add(this._events!.onTimeout(() => this._view?.notifyTimeUp()));
    // Terminal results (mutually exclusive) — announced by the board.
    this._subs.add(
      view.onWin(() => {
        this._events?.emitWin();
        this._view?.setInteractive(false);
      }),
    );
    this._subs.add(view.onLose(() => this._events?.emitLose()));
    // End card shown (win / lose / idle) → freeze the board behind it.
    this._subs.add(this._events!.onEndCard(() => this._view?.setInteractive(false)));
    // Broom booster → vacuum 3 identical on-screen items; report a real sweep so
    // the count only decrements when it actually did something.
    this._subs.add(
      this._events!.onBroom((ndc) => {
        if (this._view?.activateBroom(ndc)) this._events?.emitBroomUsed();
      }),
    );
    // Shuffle booster → re-scatter all items; report a real start so the hat only
    // animates when the board accepted it.
    this._subs.add(
      this._events!.onShuffle(() => {
        if (this._view?.activateShuffle()) this._events?.emitShuffleStarted(this._view.gatherScreenNdc());
      }),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._updateManager = null;
    this._events = null;
  }
}
