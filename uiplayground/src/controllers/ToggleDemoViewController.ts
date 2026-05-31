import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IToggleDemoView } from "../views/IToggleDemoView.js";

/**
 * Controller for `ToggleDemoView`. Width / height tweaks plus a "flip
 * programmatically" action that calls `view.toggle()` so the user sees
 * both toggles' transitions. Visual state (track / thumb colours) lives
 * on the registered ToggleComponentStyle now, so the old onColor
 * picker is gone — re-theme via `styleManager.modify(...)` instead.
 */
export class ToggleDemoViewController implements IViewController<IToggleDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IToggleDemoView | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IToggleDemoView): void {
    if (!this._controls) {
      throw new Error("ToggleDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addSliderControl(
        "width",
        { min: 36, max: 120, step: 4, value: 60, format: (v) => `${Math.round(v)}px` },
        (v) => this._onWidthChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "height",
        { min: 20, max: 56, step: 2, value: 32, format: (v) => `${Math.round(v)}px` },
        (v) => this._onHeightChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addActionControl("Flip both programmatically", () => this._onProgrammaticFlip()),
    );

    this._subs.add(view.onChange((which, value) => this._onLiveChange(which, value)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  // ── Control handlers ────────────────────────────────────────────────

  private _onWidthChanged(v: number): void {
    this._view?.setWidth(Math.round(v));
  }

  private _onHeightChanged(v: number): void {
    this._view?.setHeight(Math.round(v));
  }

  private _onProgrammaticFlip(): void {
    this._view?.toggle();
  }

  private _onLiveChange(which: "default" | "custom", value: boolean): void {
    this._controls?.appendLog(`Toggle (${which}) → onChange ${value ? "ON" : "OFF"}`);
  }
}
