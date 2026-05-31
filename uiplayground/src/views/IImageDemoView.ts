import type { IView } from "@gamebyte/gamelabsjs";
import type { ImageContentPreset, ImageFitPreset } from "../constants/DemoPresets.js";

/**
 * Live preview surface for the Image demo. Renders two `ImageComponent`s
 * side-by-side — one using the framework default style, one using a
 * style override that sets `image.color` (amber tint) and `image.alpha`
 * — both showing the same canvas-generated test texture so the
 * StyleManager-driven theming flow is visible at a glance.
 *
 * Constructor-only props (fit / padding / customAlpha) rebuild both
 * images; `setContent` swaps the per-instance test texture on both via
 * `setTexture` without rebuilding (textures are pre-built once at
 * construction and looked up by index).
 */
export interface IImageDemoView extends IView {
  setFit(fit: ImageFitPreset): void;
  setPadding(padding: number): void;
  setContent(content: ImageContentPreset): void;
  /** Alpha override applied to the custom-skin image's style. Default skin is unaffected. */
  setCustomAlpha(alpha: number): void;
  setOutlineVisible(visible: boolean): void;
}
