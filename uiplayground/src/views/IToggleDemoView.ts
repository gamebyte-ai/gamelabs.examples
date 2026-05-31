import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Live preview surface for the Toggle demo. Renders two toggles
 * side-by-side — one using the framework default skin, one using a
 * custom skin pointing at the playground's own asset ids — so the
 * StyleManager-driven theming flow is visible in a single shot.
 *
 * Geometry tweaks (width / height) rebuild both toggles. The value
 * state is local to each toggle; the programmatic `toggle()` action
 * flips both at once.
 */
export interface IToggleDemoView extends IView {
  setWidth(width: number): void;
  setHeight(height: number): void;
  /** Flip both toggles' state programmatically (also fires `onChange` on each). */
  toggle(): void;
  /** Toggles the debug outline drawn around each component's bounds. */
  setOutlineVisible(visible: boolean): void;
  /** Fires whenever a toggle (either skin) changes state. */
  onChange(cb: (which: "default" | "custom", value: boolean) => void): Unsubscribe;
}
