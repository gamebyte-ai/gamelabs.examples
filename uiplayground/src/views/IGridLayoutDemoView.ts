import type { IView } from "@gamebyte/gamelabsjs";
import type {
  GridAlignItems,
  GridFlexWrap,
  GridItemHeightMode,
  GridJustifyContent,
} from "../constants/DemoPresets.js";

/**
 * Live preview surface for the GridLayout demo. The view owns the
 * `GridLayoutComponent` instance and the colored child squares; the
 * controller reshapes them through these setters.
 *
 * `GridLayoutComponent` is a passive layout container — no events to
 * subscribe to. The controller logs prop changes to provide visible
 * feedback in the event log.
 */
export interface IGridLayoutDemoView extends IView {
  setGap(gap: number): void;
  setPadding(padding: number): void;
  setItemCount(count: number): void;
  setAlignItems(value: GridAlignItems): void;
  setJustifyContent(value: GridJustifyContent): void;
  setFlexWrap(value: GridFlexWrap): void;
  /**
   * Switches the per-item height pattern. Varying heights make
   * `alignItems` (cross-axis alignment within a row) visibly take
   * effect — with uniform heights the row exactly matches its items
   * and there's no spare room to align into.
   */
  setItemHeightMode(mode: GridItemHeightMode): void;
  /** Toggles the debug outline drawn around the live component's bounds. */
  setOutlineVisible(visible: boolean): void;
}
