import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameAreaView } from "../views/IGameAreaView";
import { GameEvents } from "../events/GameEvents";
import { GameOperations } from "../utilities/GameOperations";

/**
 * Parent controller for the game-area world view. Routes the three
 * world-pointer events to ops, kicks ops off on initialize, and
 * registers the per-frame `ops.update` tick. Visual concerns are
 * each wired by their own sub-view's controller and don't pass
 * through here.
 */
export class GameAreaViewController implements IViewController<IGameAreaView> {
  private _view: IGameAreaView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _ops: GameOperations | null = null;
  private _gameEvents: GameEvents | null = null;
  private _updateManager: UpdateManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._ops = resolver.getInstance(GameOperations);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IGameAreaView): void {
    this._view = view;
    this._subs.add(this._view.onAimAtWorld((x, y) => this._ops?.aimAt(x, y)));
    this._subs.add(this._view.onFire(() => this._ops?.fire()));
    this._subs.add(this._view.onSwap(() => this._ops?.swap()));
    this._subs.add(this._gameEvents!.onLayoutChanged(() => this._view?.rebuildPlayArea()));
    this._subs.add(this._updateManager!.register((dt) => this._ops?.update(dt), 0));
    this._ops!.start();
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._ops = null;
    this._gameEvents = null;
    this._updateManager = null;
  }
}
