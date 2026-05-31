import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import {
  IMAGE_CONTENT_PRESETS,
  IMAGE_FIT_PRESETS,
  type ImageContentPreset,
  type ImageFitPreset,
} from "../constants/DemoPresets.js";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IImageDemoView } from "../views/IImageDemoView.js";

/**
 * Controller for `ImageDemoView`. Drives fit / padding / content (the
 * three knobs that make `ImageComponent`'s scaling math visible) and
 * forwards each control change to the shell's event log.
 */
export class ImageDemoViewController implements IViewController<IImageDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IImageDemoView | null = null;
  private _fitIndex = 0; // default: "contain"
  private _contentIndex = 0; // default: "wide"
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IImageDemoView): void {
    if (!this._controls) {
      throw new Error("ImageDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addDropdownControl(
        "fit",
        IMAGE_FIT_PRESETS,
        this._fitIndex,
        (fit) => fit,
        (fit, index) => this._onFitCycled(fit, index),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "padding",
        { min: 0.5, max: 1, step: 0.02, value: 1, format: (v) => v.toFixed(2) },
        (v) => this._onPaddingChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "content",
        IMAGE_CONTENT_PRESETS,
        this._contentIndex,
        (content) => content.label,
        (content, index) => this._onContentCycled(content, index),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "customAlpha",
        { min: 0, max: 1, step: 0.05, value: 1, format: (v) => v.toFixed(2) },
        (v) => this._onCustomAlphaChanged(v),
      ),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  // ── Control handlers ────────────────────────────────────────────────

  private _onFitCycled(value: ImageFitPreset, index: number): void {
    this._fitIndex = index;
    this._view?.setFit(value);
    this._controls?.appendLog(`Image → fit=${value}`);
  }

  private _onPaddingChanged(v: number): void {
    this._view?.setPadding(v);
  }

  private _onContentCycled(value: ImageContentPreset, index: number): void {
    this._contentIndex = index;
    this._view?.setContent(value);
    this._controls?.appendLog(
      `Image → content=${value.label} (${value.width}×${value.height})`,
    );
  }

  private _onCustomAlphaChanged(v: number): void {
    this._view?.setCustomAlpha(v);
  }
}
