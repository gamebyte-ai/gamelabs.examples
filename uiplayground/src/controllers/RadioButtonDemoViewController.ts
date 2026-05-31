import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { RADIO_LABEL_PRESETS } from "../constants/DemoPresets.js";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IRadioButtonDemoView } from "../views/IRadioButtonDemoView.js";

/**
 * Controller for `RadioButtonDemoView`. Drives radius / gap / label
 * through the controls panel, plus a "toggle selected" action that
 * exercises the component's silent `setSelected` API. Visual state
 * comes from the registered RadioButtonComponentStyle now, so the old
 * innerRadius / borderWidth / selectedColor controls are gone — re-
 * theme the radios from the registered StyleManager defaults instead.
 */
export class RadioButtonDemoViewController implements IViewController<IRadioButtonDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IRadioButtonDemoView | null = null;
  private _labelIndex = 0;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IRadioButtonDemoView): void {
    if (!this._controls) {
      throw new Error("RadioButtonDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addSliderControl(
        "radius",
        { min: 6, max: 16, step: 1, value: 9, format: (v) => `${Math.round(v)}px` },
        (v) => this._onRadiusChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "gap",
        { min: 4, max: 16, step: 1, value: 8, format: (v) => `${Math.round(v)}px` },
        (v) => this._onGapChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "label",
        RADIO_LABEL_PRESETS,
        this._labelIndex,
        (text) => text,
        (text) => this._onLabelCycled(text),
      ),
    );

    this._subs.add(
      this._controls.addActionControl("Toggle selected (programmatic)", () =>
        this._onToggleSelectedPressed(),
      ),
    );

    this._subs.add(view.onPress((which) => this._onLivePress(which)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  // ── Control handlers ────────────────────────────────────────────────

  private _onRadiusChanged(v: number): void {
    this._view?.setRadius(Math.round(v));
  }

  private _onGapChanged(v: number): void {
    this._view?.setGap(Math.round(v));
  }

  private _onLabelCycled(text: string): void {
    this._labelIndex = RADIO_LABEL_PRESETS.indexOf(text);
    this._view?.setLabel(text);
  }

  private _onToggleSelectedPressed(): void {
    this._view?.toggleSelected();
    this._controls?.appendLog("RadioButton → setSelected (programmatic toggle, both skins)");
  }

  private _onLivePress(which: "default" | "custom"): void {
    this._controls?.appendLog(`RadioButton (${which}) → onPress`);
  }
}
