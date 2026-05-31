import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { ILabelDemoView } from "../views/ILabelDemoView.js";

/**
 * Controller for `LabelDemoView`. Cycles preset text strings through
 * both labels (default + badge) so the user can verify that bare text
 * re-flows via `@pixi/layout` and that the badge bg auto-resizes to
 * the new bounds. Outline toggle is the standard playground concern.
 */
export class LabelDemoViewController implements IViewController<ILabelDemoView> {
  // Preset strings cycle in order on each "Cycle text" press; long
  // strings exercise the bg auto-resize, short ones show the badge
  // inset is consistent across widths.
  private static readonly _TEXT_PRESETS: readonly string[] = ["Ready", "Score: 1234", "A longer caption that wraps the badge", "OK"];

  private _controls: IControlsManager | null = null;
  private _view: ILabelDemoView | null = null;
  private _presetIndex = 0;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: ILabelDemoView): void {
    if (!this._controls) {
      throw new Error("LabelDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(this._controls.addActionControl("Cycle text", () => this._onCycleText()));

    this._subs.add(view.onTextChanged((which, text) => this._onTextChanged(which, text)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  private _onCycleText(): void {
    this._presetIndex = (this._presetIndex + 1) % LabelDemoViewController._TEXT_PRESETS.length;
    const next = LabelDemoViewController._TEXT_PRESETS[this._presetIndex]!;
    this._view?.setText(next);
  }

  private _onTextChanged(which: "default" | "badge", text: string): void {
    this._controls?.appendLog(`Label (${which}) → setText "${text}"`);
  }
}
