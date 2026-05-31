import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { BUTTON_TEXT_PRESETS } from "../constants/DemoPresets.js";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IButtonDemoView } from "../views/IButtonDemoView.js";

/**
 * Controller for `ButtonDemoView`. Drives the two stacked buttons —
 * a default-skinned one and a custom-skinned one fetched by asset id —
 * and pipes their `onPress` events into the event log.
 *
 * The "default-button enabled" cycle flips only the default button so
 * users can see the `disabled` texture state side-by-side with an
 * always-enabled button.
 */
export class ButtonDemoViewController implements IViewController<IButtonDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IButtonDemoView | null = null;
  private _labelIndex = 0;
  private _defaultEnabled = true;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IButtonDemoView): void {
    if (!this._controls) {
      throw new Error("ButtonDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addSliderControl(
        "width",
        { min: 120, max: 320, step: 10, value: 220, format: (v) => `${Math.round(v)}px` },
        (v) => this._view?.setWidth(Math.round(v)),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "height",
        { min: 32, max: 80, step: 2, value: 56, format: (v) => `${Math.round(v)}px` },
        (v) => this._view?.setHeight(Math.round(v)),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "label",
        BUTTON_TEXT_PRESETS,
        this._labelIndex,
        (text) => text,
        (text) => this._onLabelCycled(text),
      ),
    );

    this._subs.add(
      this._controls.addCycleControl(
        "default enabled",
        [true, false],
        0,
        (v) => (v ? "on" : "off"),
        (v) => this._onDefaultEnabledCycled(v),
      ),
    );

    this._subs.add(
      this._controls.addActionControl("Trigger onPress (programmatic)", () =>
        this._controls?.appendLog("Button → onPress (programmatic)"),
      ),
    );

    this._subs.add(view.onPress((which) => this._controls?.appendLog(`Button[${which}] → onPress`)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  private _onLabelCycled(text: string): void {
    this._labelIndex = BUTTON_TEXT_PRESETS.indexOf(text);
    this._view?.setLabel(text);
  }

  private _onDefaultEnabledCycled(enabled: boolean): void {
    this._defaultEnabled = enabled;
    this._view?.setDefaultButtonEnabled(enabled);
  }
}
