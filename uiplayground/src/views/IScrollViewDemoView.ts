import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { ScrollViewDirectionPreset } from "../constants/DemoPresets.js";

/**
 * Live preview surface for the ScrollView demo. Renders two
 * `ScrollViewComponent`s side-by-side — one using the framework default
 * skin and one using a custom skin pointing at the playground's own
 * asset ids — so the StyleManager-driven theming flow is visible in a
 * single shot.
 *
 * Constructor-only props (direction / showScrollbar / wheelSpeed)
 * rebuild both scroll views; itemCount mutates the existing content
 * containers in-place so user scroll positions survive control changes.
 * Programmatic scroll-to-start / scroll-to-end actions apply to both.
 * Live `onScroll` events carry a `which: "default" | "custom"` tag so
 * the controller's log distinguishes them.
 */
export interface IScrollViewDemoView extends IView {
  setDirection(direction: ScrollViewDirectionPreset): void;
  setItemCount(count: number): void;
  setShowScrollbar(visible: boolean): void;
  setWheelSpeed(speed: number): void;
  /** Programmatically scroll to (0, 0) on both scroll views. */
  scrollToStart(): void;
  /** Programmatically scroll to the bottom-right of the scrollable range on both scroll views. */
  scrollToEnd(): void;
  setOutlineVisible(visible: boolean): void;
  /** Fires whenever a scroll view's offset changes (user-driven OR programmatic). */
  onScroll(cb: (which: "default" | "custom", x: number, y: number) => void): Unsubscribe;
}
