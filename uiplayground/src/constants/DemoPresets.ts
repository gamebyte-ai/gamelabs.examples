/**
 * Demo-specific palettes and preset lists. Demos cycle through these
 * via `makeCycleRow` to test their components against a known-good set
 * of inputs.
 */

// ─── ButtonDemo ────────────────────────────────────────────────────────
export const BUTTON_FILL_PALETTE: readonly number[] = [
  0x3b82f6, 0x22c55e, 0xef4444, 0xeab308, 0xa855f7,
];
export const BUTTON_FILL_LABELS: readonly string[] = ["blue", "green", "red", "yellow", "purple"];
export const BUTTON_TEXT_PRESETS: readonly string[] = [
  "Click me",
  "Submit",
  "Cancel",
  "Save",
  "Continue",
];

// ─── SliderDemo ────────────────────────────────────────────────────────
export interface SliderRangePreset {
  readonly min: number;
  readonly max: number;
  readonly label: string;
}

export const SLIDER_RANGE_PRESETS: readonly SliderRangePreset[] = [
  { min: 0, max: 1, label: "0..1" },
  { min: 0, max: 100, label: "0..100" },
  { min: -1, max: 1, label: "-1..1" },
  { min: 0, max: 360, label: "0..360" },
];

// ─── GridLayoutDemo ────────────────────────────────────────────────────
export type GridAlignItems = "flex-start" | "center" | "flex-end" | "stretch";
export type GridJustifyContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type GridFlexWrap = "wrap" | "nowrap" | "wrap-reverse";

/** Rotating palette used to color the demo's child squares. */
export const GRID_ITEM_PALETTE: readonly number[] = [
  0xef4444, 0xf97316, 0xeab308, 0x22c55e, 0x14b8a6, 0x3b82f6, 0x8b5cf6, 0xec4899,
];

export const GRID_ALIGN_ITEMS: readonly GridAlignItems[] = [
  "flex-start",
  "center",
  "flex-end",
  "stretch",
];

export const GRID_JUSTIFY_CONTENT: readonly GridJustifyContent[] = [
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
];

export const GRID_FLEX_WRAP: readonly GridFlexWrap[] = ["wrap", "nowrap", "wrap-reverse"];

/**
 * Per-item height pattern. Used by the demo to make `alignItems` visibly
 * do something — when every item is the same height each row collapses
 * to that height and cross-axis alignment has no spare room to apply.
 */
export type GridItemHeightMode = "uniform" | "alternating" | "ascending" | "random";

export const GRID_ITEM_HEIGHT_MODES: readonly GridItemHeightMode[] = [
  "uniform",
  "alternating",
  "ascending",
  "random",
];

export const GRID_ITEM_HEIGHT_MODE_LABELS: Readonly<Record<GridItemHeightMode, string>> = {
  uniform: "Uniform",
  alternating: "Alternating",
  ascending: "Ascending",
  random: "Random",
};

// ─── DropdownDemo ──────────────────────────────────────────────────────

export interface DropdownItemPreset {
  readonly id: string;
  readonly label: string;
}

/**
 * Pool of items the demo cycles between via the `itemCount` control.
 * The controller slices the first N entries based on the selected
 * count so a single library backs every variant.
 */
export const DROPDOWN_ITEM_LIBRARY: readonly DropdownItemPreset[] = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
  { id: "insane", label: "Insane" },
  { id: "custom", label: "Custom" },
  { id: "tutorial", label: "Tutorial" },
  { id: "story", label: "Story" },
  { id: "sandbox", label: "Sandbox" },
];

export const DROPDOWN_PLACEHOLDERS: readonly string[] = [
  "Select…",
  "Choose difficulty",
  "Pick one",
];

// ─── RadioButtonDemo ───────────────────────────────────────────────────

export const RADIO_LABEL_PRESETS: readonly string[] = [
  "Option A",
  "Easy mode",
  "Subscribe to updates",
  "Enable notifications",
];

// ─── RadioButtonGroupDemo ──────────────────────────────────────────────

export interface RadioGroupItemPreset {
  readonly id: string;
  readonly label: string;
}

export const RADIO_GROUP_ITEM_LIBRARY: readonly RadioGroupItemPreset[] = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
  { id: "insane", label: "Insane" },
  { id: "custom", label: "Custom" },
];

export type RadioGroupDirection = "column" | "row";

export const RADIO_GROUP_DIRECTIONS: readonly RadioGroupDirection[] = ["column", "row"];

// ─── ScrollViewDemo ────────────────────────────────────────────────────

export type ScrollViewDirectionPreset = "vertical" | "horizontal" | "both";

export const SCROLL_VIEW_DIRECTIONS: readonly ScrollViewDirectionPreset[] = [
  "vertical",
  "horizontal",
  "both",
];

/**
 * Color palette used to colour each scrollable demo item — index
 * modulo length so an arbitrary item count keeps cycling through.
 */
export const SCROLL_VIEW_ITEM_PALETTE: readonly number[] = [
  0xef4444, 0xf97316, 0xeab308, 0x22c55e, 0x14b8a6, 0x3b82f6, 0x8b5cf6, 0xec4899,
];

// ─── ListDemo ──────────────────────────────────────────────────────────

export type ListVariantPreset = "text" | "text+image" | "image";

export const LIST_VARIANTS: readonly ListVariantPreset[] = ["text", "text+image", "image"];

export type ListSelectionModePreset = "none" | "single" | "multi";

export const LIST_SELECTION_MODES: readonly ListSelectionModePreset[] = [
  "none",
  "single",
  "multi",
];

// ─── ImageDemo ─────────────────────────────────────────────────────────

export type ImageFitPreset = "contain" | "cover" | "stretch";

export const IMAGE_FIT_PRESETS: readonly ImageFitPreset[] = ["contain", "cover", "stretch"];

/**
 * Aspect-ratio variants the Image demo cycles through. Each preset is
 * a different shape so the user can see how `fit` / `padding` re-scale
 * and re-align the texture inside a fixed-size box.
 */
export interface ImageContentPreset {
  /** Source-texture width in pixels. */
  readonly width: number;
  /** Source-texture height in pixels. */
  readonly height: number;
  /** Background fill colour for the canvas-generated test texture. */
  readonly color: number;
  /** Short label shown in the controls panel + event log. */
  readonly label: string;
}

export const IMAGE_CONTENT_PRESETS: readonly ImageContentPreset[] = [
  { width: 200, height: 100, color: 0x3b82f6, label: "wide" },
  { width: 100, height: 100, color: 0x22c55e, label: "square" },
  { width: 100, height: 200, color: 0xef4444, label: "tall" },
];
