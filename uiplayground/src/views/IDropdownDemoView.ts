import type { DropdownItem, IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Live preview surface for the Dropdown demo. Renders two dropdowns
 * stacked vertically — one using the framework default skin, one using
 * a custom skin pointing at the playground's own asset ids — so the
 * StyleManager-driven theming flow is visible in a single shot.
 *
 * Constructor-only props (width / itemHeight / placeholder) rebuild
 * both dropdowns; mutable props (items, programmatic selection,
 * programmatic toggle) flow through to both live instances. User-
 * driven `onChange` events are tagged with `"default"` / `"custom"` so
 * the controller's log distinguishes them.
 */
export interface IDropdownDemoView extends IView {
  setWidth(width: number): void;
  setItemHeight(height: number): void;
  setPlaceholder(placeholder: string): void;
  setItems(items: readonly DropdownItem[]): void;
  /** Programmatically set selection on both dropdowns. */
  setSelectedId(id: string | null): void;
  /** Programmatically flip both dropdowns' option lists open ↔ closed. */
  toggleList(): void;
  /** Toggles the debug outline drawn around each dropdown's header bounds. */
  setOutlineVisible(visible: boolean): void;
  /** Fires whenever the user picks an option in either dropdown. */
  onChange(cb: (which: "default" | "custom", id: string, item: DropdownItem) => void): Unsubscribe;
  /**
   * Fires when the test button rendered below the dropdowns is pressed.
   * The button exists as a fixture for verifying overlay z-order: a
   * dropdown's open list should paint over this button, and the button
   * should be clickable once the list closes.
   */
  onTestButtonPress(cb: () => void): Unsubscribe;
}
