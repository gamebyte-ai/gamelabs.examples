import type { IView, RadioButtonGroupItem, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { RadioGroupDirection } from "../constants/DemoPresets.js";

/**
 * Live preview surface for the RadioButtonGroup demo. The view owns the
 * `RadioButtonGroupComponent` instance and rebuilds it whenever a
 * constructor-only prop (direction / spacing / radius) changes; items
 * and selection flow through to the live instance via setItems /
 * setSelectedId. Group children render with the framework default
 * RadioButtonComponentStyle — apps re-theme via
 * `styleManager.modify(UIComponentsStyleIds.RadioButton, …)`.
 */
export interface IRadioButtonGroupDemoView extends IView {
  setItems(items: readonly RadioButtonGroupItem[]): void;
  setDirection(direction: RadioGroupDirection): void;
  setSpacing(spacing: number): void;
  /** Forwarded to every child button's `radius`. */
  setRadius(radius: number): void;
  setSelectedId(id: string | null): void;
  setOutlineVisible(visible: boolean): void;
  /** Fires whenever the user picks a different option. */
  onChange(cb: (id: string, item: RadioButtonGroupItem) => void): Unsubscribe;
}
