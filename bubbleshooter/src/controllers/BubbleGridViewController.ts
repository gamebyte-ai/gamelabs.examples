import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IBubbleGridView } from "../views/IBubbleGridView";
import { GameEvents } from "../events/GameEvents";

/**
 * Routes grid-cell + snap-shake events to the {@link IBubbleGridView}
 * and ticks the shake animation. Three subscriptions plus one tick.
 */
export class BubbleGridViewController implements IViewController<IBubbleGridView> {
  private _view: IBubbleGridView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;
  private _updateManager: UpdateManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IBubbleGridView): void {
    this._view = view;
    const e = this._gameEvents!;
    this._subs.add(e.onBubblePlaced((r, c, color) => this._view?.setBubble(r, c, color)));
    this._subs.add(e.onBubbleRemoved((r, c) => this._view?.removeBubble(r, c)));
    this._subs.add(e.onBubbleSnapped((r, c) => this._view?.playSnapShake(r, c)));
    this._subs.add(e.onGridDescended((rows) => this._view?.playDescent(rows)));
    this._subs.add(e.onLayoutChanged(() => this._view?.applyLayoutReset()));
    this._subs.add(this._updateManager!.register((dt) => this._view?.tickGridAnimation(dt), 0));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
    this._updateManager = null;
  }
}
