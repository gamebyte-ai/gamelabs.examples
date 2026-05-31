import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IFlightView } from "../views/IFlightView";
import { GameEvents } from "../events/GameEvents";

/**
 * Routes the three in-flight projectile events to the {@link IFlightView}.
 * No derived state — ops owns positions; the view just renders.
 */
export class FlightViewController implements IViewController<IFlightView> {
  private _view: IFlightView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
  }

  public initialize(view: IFlightView): void {
    this._view = view;
    const e = this._gameEvents!;
    this._subs.add(e.onFlyingBubbleChanged((color, x, y) => this._view?.setFlyingBubble(color, x, y)));
    this._subs.add(e.onFlyingBombChanged((active, x, y) => this._view?.setFlyingBomb(active, x, y)));
    this._subs.add(e.onFireballChanged((active, x, y) => this._view?.setFireball(active, x, y)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
  }
}
