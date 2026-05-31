import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IFallingBubblesView } from "../views/IFallingBubblesView";
import { GameEvents } from "../events/GameEvents";

/**
 * Routes `onFallingBubbleChanged` events to the falling-bubbles view.
 * Single subscription, no derived state — all the physics live in
 * `GameOperations`; the view just renders positions.
 */
export class FallingBubblesViewController implements IViewController<IFallingBubblesView> {
  private _view: IFallingBubblesView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
  }

  public initialize(view: IFallingBubblesView): void {
    this._view = view;
    this._subs.add(
      this._gameEvents!.onFallingBubbleChanged((id, color, x, y) => this._view?.setFallingBubble(id, color, x, y)),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
  }
}
