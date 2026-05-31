import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IBackgroundDemoView } from "../views/IBackgroundDemoView.js";

/**
 * Controller for `BackgroundDemoView`. Drives the overlay-alpha slider
 * (the only `BackgroundComponentOpts` field worth exposing live in the
 * playground). The settings module has its own dedicated demo entry —
 * see `SettingsModuleDemoView*`.
 */
export class BackgroundDemoViewController implements IViewController<IBackgroundDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IBackgroundDemoView | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IBackgroundDemoView): void {
    if (!this._controls) {
      throw new Error("BackgroundDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addSliderControl(
        "overlayAlpha",
        { min: 0, max: 1, step: 0.05, value: 0.12, format: (v) => v.toFixed(2) },
        (v) => this._onOverlayAlphaChanged(v),
      ),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  // ── Control handlers ────────────────────────────────────────────────

  private _onOverlayAlphaChanged(value: number): void {
    this._view?.setOverlayAlpha(value);
  }
}
