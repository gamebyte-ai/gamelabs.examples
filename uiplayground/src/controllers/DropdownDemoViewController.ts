import {
  UnsubscribeBag,
  type DropdownItem,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { DROPDOWN_ITEM_LIBRARY, DROPDOWN_PLACEHOLDERS } from "../constants/DemoPresets.js";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IDropdownDemoView } from "../views/IDropdownDemoView.js";

/**
 * Controller for `DropdownDemoView`. Drives width / itemHeight /
 * placeholder / itemCount through the controls panel and exposes
 * action buttons for the programmatic API (`toggle`, cycle selection,
 * clear). Live `onChange` events from the dropdown are piped into the
 * shell's event log.
 */
export class DropdownDemoViewController implements IViewController<IDropdownDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IDropdownDemoView | null = null;
  /** Current item count (1..6). Slice depth into DROPDOWN_ITEM_LIBRARY. */
  private _itemCount = 5;
  private _placeholderIndex = 0; // default: "Select…"
  private _selectionCycleIndex = 0; // 0 = null, 1..N = items
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IDropdownDemoView): void {
    if (!this._controls) {
      throw new Error("DropdownDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    // Seed the items list before exposing any controls so the live
    // dropdown shows real options on first paint.
    view.setItems(this._currentItems());

    this._subs.add(
      this._controls.addSliderControl(
        "width",
        { min: 120, max: 280, step: 10, value: 200, format: (v) => `${Math.round(v)}px` },
        (v) => this._onWidthChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "itemHeight",
        { min: 24, max: 48, step: 2, value: 32, format: (v) => `${Math.round(v)}px` },
        (v) => this._onItemHeightChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addDropdownControl(
        "placeholder",
        DROPDOWN_PLACEHOLDERS,
        this._placeholderIndex,
        (text) => text,
        (text, index) => this._onPlaceholderCycled(text, index),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "itemCount",
        { min: 1, max: 6, step: 1, value: this._itemCount, format: (v) => `${Math.round(v)}` },
        (v) => this._onItemCountChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addActionControl("Toggle list (programmatic)", () => view.toggleList()),
    );

    this._subs.add(
      this._controls.addActionControl("Cycle selection (programmatic)", () =>
        this._onCycleSelectionPressed(),
      ),
    );

    this._subs.add(
      this._controls.addActionControl("Clear selection", () => this._onClearSelectionPressed()),
    );

    this._subs.add(view.onChange((which, id, item) => this._onLiveChange(which, id, item)));
    this._subs.add(view.onTestButtonPress(() => this._onTestButtonPressed()));
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

  private _onItemHeightChanged(v: number): void {
    this._view?.setItemHeight(Math.round(v));
  }

  private _onPlaceholderCycled(value: string, index: number): void {
    this._placeholderIndex = index;
    this._view?.setPlaceholder(value);
    this._controls?.appendLog(`Dropdown → placeholder="${value}"`);
  }

  private _onItemCountChanged(v: number): void {
    const count = Math.round(v);
    if (count === this._itemCount) return;
    this._itemCount = count;
    this._selectionCycleIndex = 0; // reset since the items list shape changed
    this._view?.setItems(this._currentItems());
    this._controls?.appendLog(`Dropdown → itemCount=${count}`);
  }

  private _onCycleSelectionPressed(): void {
    const items = this._currentItems();
    // Cycle through [null, ...items].
    this._selectionCycleIndex = (this._selectionCycleIndex + 1) % (items.length + 1);
    const next = this._selectionCycleIndex === 0 ? null : items[this._selectionCycleIndex - 1]!;
    this._view?.setSelectedId(next?.id ?? null);
    this._controls?.appendLog(
      next ? `Dropdown → setSelectedId="${next.id}"` : "Dropdown → setSelectedId=null",
    );
  }

  private _onClearSelectionPressed(): void {
    this._selectionCycleIndex = 0;
    this._view?.setSelectedId(null);
    this._controls?.appendLog("Dropdown → setSelectedId=null");
  }

  private _onLiveChange(which: "default" | "custom", id: string, item: DropdownItem): void {
    // Keep the local cycle index aligned with whatever the user chose
    // so the next "Cycle selection" press advances from there.
    const items = this._currentItems();
    const idx = items.findIndex((it) => it.id === id);
    this._selectionCycleIndex = idx === -1 ? 0 : idx + 1;
    this._controls?.appendLog(`Dropdown (${which}) → onChange id="${id}" label="${item.label}"`);
  }

  private _onTestButtonPressed(): void {
    this._controls?.appendLog("Dropdown demo → button-below pressed");
  }

  private _currentItems(): readonly DropdownItem[] {
    return DROPDOWN_ITEM_LIBRARY.slice(0, this._itemCount);
  }
}
