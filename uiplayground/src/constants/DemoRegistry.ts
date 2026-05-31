import type { DemoEntry } from "./PlaygroundTypes.js";

/**
 * Registered playground demos. Each entry shows up as a sidebar row
 * and resolves to a concrete demo View class inside the shell view's
 * `_DEMO_VIEW_BY_ID` map.
 *
 * To add a new demo:
 *   1. Create the demo's View + ViewController pair under
 *      `views/<X>DemoView.pixi.ts` + `controllers/<X>DemoViewController.ts`.
 *   2. Register the pair in `UIPlaygroundApp.configureViews` via
 *      `viewFactory.register(<X>DemoView, <X>DemoViewController)`.
 *   3. Add a `{ id, label, category }` row here.
 *   4. Add the `id → <X>DemoView` mapping inside
 *      `PlaygroundShellView._DEMO_VIEW_BY_ID`.
 */
export const DEMO_REGISTRY: readonly DemoEntry[] = [
  { id: "button", label: "Button", category: "Component" },
  { id: "slider", label: "Slider", category: "Component" },
  { id: "toggle", label: "Toggle", category: "Component" },
  { id: "grid-layout", label: "GridLayout", category: "Component" },
  { id: "dropdown", label: "Dropdown", category: "Component" },
  { id: "radio-button", label: "RadioButton", category: "Component" },
  { id: "radio-group", label: "RadioButtonGroup", category: "Component" },
  { id: "scroll-view", label: "ScrollView", category: "Component" },
  { id: "list", label: "List", category: "Component" },
  { id: "image", label: "Image", category: "Component" },
  { id: "label", label: "Label", category: "Component" },
  { id: "background", label: "Background", category: "Component" },
  { id: "settings", label: "Settings", category: "Module" },
];
