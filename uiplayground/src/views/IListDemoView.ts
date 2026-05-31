import type { IView, ListItem, Unsubscribe } from "@gamebyte/gamelabsjs";
import type {
  ListSelectionModePreset,
  ListVariantPreset,
} from "../constants/DemoPresets.js";

/**
 * Live preview surface for the List demo. Renders two `ListComponent`s
 * stacked vertically — one using the framework default skin, one using
 * a custom skin pointing at the playground's own asset ids — so the
 * StyleManager-driven theming flow is visible in a single shot.
 *
 * Constructor-only props (variant / selectionMode / itemHeight) rebuild
 * both lists; itemCount mutates the existing instances via `setItems`
 * so selection bookkeeping flows through. User taps on either list
 * only affect that list's selection — they're not synced. Live
 * `onChange` / `onItemPress` events carry a `which: "default" |
 * "custom"` tag so the controller's log distinguishes them.
 */
export interface IListDemoView extends IView {
  setVariant(variant: ListVariantPreset): void;
  setSelectionMode(mode: ListSelectionModePreset): void;
  setItemCount(count: number): void;
  setItemHeight(height: number): void;
  /** Programmatically clear the selection on both lists (no-op in `"none"` mode). */
  clearSelection(): void;
  setOutlineVisible(visible: boolean): void;
  /** Fires only on user-driven selection changes (single / multi modes). */
  onChange(
    cb: (which: "default" | "custom", selectedIds: readonly string[], selectedItems: readonly ListItem[]) => void,
  ): Unsubscribe;
  /** Fires on every user tap, regardless of selection mode. */
  onItemPress(cb: (which: "default" | "custom", id: string, item: ListItem) => void): Unsubscribe;
}
