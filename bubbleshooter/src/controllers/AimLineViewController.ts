import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IAimLineView } from "../views/IAimLineView";
import type { BubbleColor } from "../constants/BubbleColor";
import { GameEvents } from "../events/GameEvents";

/**
 * Drives the {@link IAimLineView} from trajectory + power-up + held-
 * colour signals and ticks the marching dot animation. Three event
 * subscriptions plus one update tick — all narrow concerns of the
 * aim-feedback layer.
 */
export class AimLineViewController implements IViewController<IAimLineView> {
  private _view: IAimLineView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;
  private _updateManager: UpdateManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IAimLineView): void {
    this._view = view;
    const e = this._gameEvents!;
    this._subs.add(e.onAimTrajectoryChanged((traj) => this._view?.setAimTrajectory(traj)));
    this._subs.add(e.onAimPowerUpModeChanged((active) => this._view?.setAimPowerUpMode(active)));
    this._subs.add(e.onShooterColorChanged(this._onShooterColor));
    this._subs.add(e.onShooterSwap((newHeld) => this._view?.setLandingPreviewColor(newHeld)));
    this._subs.add(e.onAimAidVisibleChanged((visible) => this._view?.setAimAidVisible(visible)));
    this._subs.add(this._updateManager!.register((dt) => this._view?.updateAimDots(dt), 0));
  }

  private readonly _onShooterColor = (color: BubbleColor | null): void => {
    if (color !== null) this._view?.setLandingPreviewColor(color);
  };

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
    this._updateManager = null;
  }
}
