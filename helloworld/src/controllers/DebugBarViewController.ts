import { IDevUtils, UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IDebugBarView } from "../views/IDebugBarView";
import { DebugEvents } from "../events/DebugEvents";

export class DebugBarViewController implements IViewController<IDebugBarView> {
  private _view: IDebugBarView | null = null;
  private _events: DebugEvents | null = null;
  private _devUtils: IDevUtils | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _visible = false;

  public inject(resolver: IInstanceResolver): void {
    this._events = resolver.getInstance(DebugEvents);
    this._devUtils = resolver.getInstance(IDevUtils);
  }

  public initialize(view: IDebugBarView): void {
    this._view = view;
    this._visible = false;
    this._view.setBarVisible(false);

    if (this._devUtils) {
      this._devUtils.groundGrid.setOptions({ size: 20, divisions: 20, color1: 0x223047, color2: 0x152033, y: -0.75 });
      this._devUtils.groundGrid.show(true);
      this._view.setGridLabel("Grid:On");
      this._view.setStatsLabel(this._devUtils.statsPanel.isVisible ? "Stats:On" : "Stats:Off");
      this._view.setLogLabel(this._devUtils.logger.isVisible ? "Log:On" : "Log:Off");
    }

    this._subs.add(this._view.onToggleGroundGrid(() => {
      if (!this._devUtils) return;
      this._devUtils.groundGrid.setOptions({ size: 20, divisions: 20, color1: 0x223047, color2: 0x152033, y: -0.75 });
      this._devUtils.groundGrid.show(!this._devUtils.groundGrid.isVisible);
      this._view?.setGridLabel(this._devUtils.groundGrid.isVisible ? "Grid:On" : "Grid:Off");
    }));

    this._subs.add(this._view.onToggleStats(() => {
      if (!this._devUtils) return;
      this._devUtils.statsPanel.show(!this._devUtils.statsPanel.isVisible);
      this._view?.setStatsLabel(this._devUtils.statsPanel.isVisible ? "Stats:On" : "Stats:Off");
    }));

    this._subs.add(this._view.onToggleLog(() => {
      if (!this._devUtils) return;
      this._devUtils.logger.show(!this._devUtils.logger.isVisible);
      this._view?.setLogLabel(this._devUtils.logger.isVisible ? "Log:On" : "Log:Off");
    }));

    if (this._events) {
      this._subs.add(this._events.onToggleDebugPanel(() => {
        this._visible = !this._visible;
        this._view?.setBarVisible(this._visible);
      }));
    }
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._events = null;
    this._devUtils = null;
  }
}

