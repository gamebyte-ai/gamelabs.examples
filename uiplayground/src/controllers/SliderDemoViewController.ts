import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { SLIDER_RANGE_PRESETS } from "../constants/DemoPresets.js";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { ISliderDemoView } from "../views/ISliderDemoView.js";

/**
 * Controller for `SliderDemoView`. Populates controls for trackWidth,
 * range preset, stepped/continuous, and a "reset" action. Skin colour
 * is no longer configurable from controls — the live slider always
 * shows the framework default skin so the demo demonstrates the
 * out-of-the-box look. The RGB section below the live slider remains
 * a fixed fixture demonstrating per-channel tinted custom skins.
 */
export class SliderDemoViewController implements IViewController<ISliderDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: ISliderDemoView | null = null;
  private _rangeIndex = 0;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: ISliderDemoView): void {
    if (!this._controls) {
      throw new Error("SliderDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addSliderControl(
        "trackWidth",
        { min: 100, max: 360, step: 10, value: 240, format: (v) => `${Math.round(v)}px` },
        (v) => this._onTrackWidthChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "range",
        SLIDER_RANGE_PRESETS,
        this._rangeIndex,
        (preset) => preset.label,
        (_preset, index) => this._onRangeCycled(index),
      ),
    );

    this._subs.add(
      this._controls.addToggleControl("stepped", false, (v) => this._onSteppedChanged(v)),
    );

    this._subs.add(this._controls.addActionControl("Reset to min", () => this._onResetPressed()));

    this._subs.add(view.onChange((v) => this._onLiveChange(v)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  // ── Control handlers ────────────────────────────────────────────────

  private _onTrackWidthChanged(v: number): void {
    this._view?.setTrackWidth(Math.round(v));
  }

  private _onRangeCycled(index: number): void {
    this._rangeIndex = index;
    const preset = SLIDER_RANGE_PRESETS[index]!;
    this._view?.setRange(preset.min, preset.max);
  }

  private _onSteppedChanged(v: boolean): void {
    this._view?.setStepped(v);
  }

  private _onResetPressed(): void {
    const range = SLIDER_RANGE_PRESETS[this._rangeIndex]!;
    this._view?.setValue(range.min);
    this._controls?.appendLog(`Slider → reset to ${range.min}`);
  }

  private _onLiveChange(value: number): void {
    this._controls?.appendLog(`Slider → onChange ${value.toFixed(3)}`);
  }
}
