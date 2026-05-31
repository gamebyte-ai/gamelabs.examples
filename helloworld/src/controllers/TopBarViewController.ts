import { IDevUtils, UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { ITopBarView } from "../views/ITopBarView";
import { GameEvents } from "../events/GameEvents";
import { DebugEvents } from "../events/DebugEvents";

export class TopBarViewController implements IViewController<ITopBarView> {
  private _view: ITopBarView | null = null;
  private _devUtils: IDevUtils | null = null;
  private _gameEvents: GameEvents | null = null;
  private _debugEvents: DebugEvents | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _toggled = false;

  public inject(resolver: IInstanceResolver): void {
    this._devUtils = resolver.getInstance(IDevUtils);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._debugEvents = resolver.getInstance(DebugEvents);
  }

  public initialize(view: ITopBarView): void {
    this._view = view;
    this._subs.add(this._view.onToggleColor(() => this._onToggleColor()));
    this._subs.add(this._view.onToggleRotation(() => this._onToggleRotation()));
    this._subs.add(this._view.onToggleDebug(() => this._debugEvents?.emitToggleDebugPanel()));
  }

  private _onToggleColor(): void {
    this._toggled = !this._toggled;
    this._gameEvents?.emitChangeCubeColor(this._toggled ? 0xf97316 : 0x3b82f6);
    this._devUtils?.logger.log("Cube color changed");
  }

  private _onToggleRotation(): void {
    this._gameEvents?.emitToggleCubeRotation();
    this._devUtils?.logger.log("Cube rotation toggled");
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
    this._debugEvents = null;
  }
}
