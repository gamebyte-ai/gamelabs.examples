import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { GameplayEvents } from "../events/GameplayEvents";

/** Emits the gameplay `start` event on the first tap. */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _events: GameplayEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._events = resolver.getInstance(GameplayEvents);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;
    this._subs.add(view.onTap(() => this._events?.emitStart()));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._events = null;
  }
}
