import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import {
  GRID_ALIGN_ITEMS,
  GRID_FLEX_WRAP,
  GRID_ITEM_HEIGHT_MODE_LABELS,
  GRID_ITEM_HEIGHT_MODES,
  GRID_JUSTIFY_CONTENT,
  type GridAlignItems,
  type GridFlexWrap,
  type GridItemHeightMode,
  type GridJustifyContent,
} from "../constants/DemoPresets.js";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IGridLayoutDemoView } from "../views/IGridLayoutDemoView.js";

/**
 * Controller for `GridLayoutDemoView`. The grid is a passive layout
 * (no events) so the controls drive every visible change. Each tweak
 * is also logged to the event log so the user gets feedback on actions
 * that don't have a corresponding component callback.
 */
export class GridLayoutDemoViewController implements IViewController<IGridLayoutDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IGridLayoutDemoView | null = null;
  private _alignItemsIndex = 1; // default: "center"
  private _justifyContentIndex = 0; // default: "flex-start"
  private _flexWrapIndex = 0; // default: "wrap"
  private _itemHeightModeIndex = 0; // default: "uniform"
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IGridLayoutDemoView): void {
    if (!this._controls) {
      throw new Error("GridLayoutDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addSliderControl(
        "gap",
        { min: 0, max: 32, step: 1, value: 8, format: (v) => `${Math.round(v)}px` },
        (v) => this._onGapChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "padding",
        { min: 0, max: 32, step: 1, value: 12, format: (v) => `${Math.round(v)}px` },
        (v) => this._onPaddingChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "itemCount",
        { min: 1, max: 36, step: 1, value: 8, format: (v) => `${Math.round(v)}` },
        (v) => this._onItemCountChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "alignItems",
        GRID_ALIGN_ITEMS,
        this._alignItemsIndex,
        (value) => value,
        (value, index) => this._onAlignItemsCycled(value, index),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "justifyContent",
        GRID_JUSTIFY_CONTENT,
        this._justifyContentIndex,
        (value) => value,
        (value, index) => this._onJustifyContentCycled(value, index),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "flexWrap",
        GRID_FLEX_WRAP,
        this._flexWrapIndex,
        (value) => value,
        (value, index) => this._onFlexWrapCycled(value, index),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "itemHeights",
        GRID_ITEM_HEIGHT_MODES,
        this._itemHeightModeIndex,
        (mode) => GRID_ITEM_HEIGHT_MODE_LABELS[mode],
        (mode, index) => this._onItemHeightModeCycled(mode, index),
      ),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  // ── Control handlers ────────────────────────────────────────────────

  private _onGapChanged(v: number): void {
    const gap = Math.round(v);
    this._view?.setGap(gap);
    this._controls?.appendLog(`GridLayout → gap=${gap}px`);
  }

  private _onPaddingChanged(v: number): void {
    const padding = Math.round(v);
    this._view?.setPadding(padding);
    this._controls?.appendLog(`GridLayout → padding=${padding}px`);
  }

  private _onItemCountChanged(v: number): void {
    const count = Math.round(v);
    this._view?.setItemCount(count);
    this._controls?.appendLog(`GridLayout → itemCount=${count}`);
  }

  private _onAlignItemsCycled(value: GridAlignItems, index: number): void {
    this._alignItemsIndex = index;
    this._view?.setAlignItems(value);
    this._controls?.appendLog(`GridLayout → alignItems=${value}`);
  }

  private _onJustifyContentCycled(value: GridJustifyContent, index: number): void {
    this._justifyContentIndex = index;
    this._view?.setJustifyContent(value);
    this._controls?.appendLog(`GridLayout → justifyContent=${value}`);
  }

  private _onFlexWrapCycled(value: GridFlexWrap, index: number): void {
    this._flexWrapIndex = index;
    this._view?.setFlexWrap(value);
    this._controls?.appendLog(`GridLayout → flexWrap=${value}`);
  }

  private _onItemHeightModeCycled(value: GridItemHeightMode, index: number): void {
    this._itemHeightModeIndex = index;
    this._view?.setItemHeightMode(value);
    this._controls?.appendLog(`GridLayout → itemHeights=${GRID_ITEM_HEIGHT_MODE_LABELS[value]}`);
  }
}
