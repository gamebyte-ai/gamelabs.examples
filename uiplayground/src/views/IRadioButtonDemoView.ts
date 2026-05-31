import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Live preview surface for the RadioButton demo. Renders two radios
 * side-by-side — one using the framework default skin, one using a
 * custom skin pointing at the playground's own asset ids — so the
 * StyleManager-driven theming flow is visible in a single shot.
 *
 * Geometry tweaks (radius / gap) and label changes rebuild both
 * radios. The selected state is local to each radio and toggled
 * programmatically via `toggleSelected` (which targets both).
 */
export interface IRadioButtonDemoView extends IView {
  setRadius(radius: number): void;
  setGap(gap: number): void;
  setLabel(label: string): void;
  /** Flip both radios' selected state (uses the component's `setSelected`). */
  toggleSelected(): void;
  setOutlineVisible(visible: boolean): void;
  /** Fires whenever the user taps either radio's hit area. */
  onPress(cb: (which: "default" | "custom") => void): Unsubscribe;
}
