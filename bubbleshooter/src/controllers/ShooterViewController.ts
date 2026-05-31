import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IShooterView } from "../views/IShooterView";
import { GameEvents } from "../events/GameEvents";

/**
 * Drives the shooter rig: held / next colour, power-up flags, aim
 * angle, and the swap animation. Five subscriptions plus one update
 * tick — the swap animation is the only thing that needs per-frame
 * work, but ticking every frame keeps the wiring uniform.
 */
export class ShooterViewController implements IViewController<IShooterView> {
  private _view: IShooterView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;
  private _updateManager: UpdateManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IShooterView): void {
    this._view = view;
    const e = this._gameEvents!;
    this._subs.add(e.onShooterColorChanged((color) => this._view?.setShooterHeldColor(color)));
    this._subs.add(e.onShooterNextColorChanged((color) => this._view?.setShooterNextColor(color)));
    this._subs.add(e.onShooterBombChanged((active) => this._view?.setShooterIsBomb(active)));
    this._subs.add(e.onShooterFireballChanged((active) => this._view?.setShooterIsFireball(active)));
    this._subs.add(e.onShooterAimChanged((angle) => this._view?.setShooterAimAngle(angle)));
    this._subs.add(e.onShooterSwap((newHeld, newNext) => this._view?.playShooterSwap(newHeld, newNext)));
    this._subs.add(this._updateManager!.register((dt) => this._view?.updateShooterAnim(dt), 0));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
    this._updateManager = null;
  }
}
