import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Live preview surface for the Label demo. Renders two labels side-by-side
 * — one bare-text using the framework default style, one wrapped in a
 * 9-slice badge bg using a per-call style override pointing at the
 * playground's CustomDropdownHeader asset (a rounded violet/amber panel
 * already shipped with the playground).
 *
 * Cycling the preview text rebuilds nothing — both labels call
 * `setText(...)` and the badge auto-resizes to the new bounds. Outline
 * toggles a debug rect drawn at each label's reported layout box.
 */
export interface ILabelDemoView extends IView {
  /**
   * Replaces the displayed text on both labels. The badge auto-resizes
   * to the new bounds; the text-only label adjusts via `@pixi/layout`.
   */
  setText(text: string): void;
  /** Toggles the debug outline drawn around each label's bounds. */
  setOutlineVisible(visible: boolean): void;
  /** Fires whenever either label's text content changes. */
  onTextChanged(cb: (which: "default" | "badge", text: string) => void): Unsubscribe;
}
