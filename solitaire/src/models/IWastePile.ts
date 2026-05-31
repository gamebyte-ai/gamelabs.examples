import type { IPile } from "./IPile";

/**
 * Read-only view of the waste pile. Adds the current `drawCount` to
 * the {@link IPile} contract so controllers can read the active turn
 * mode (Turn 1 ↔ Turn 3) without casting to the mutable concrete
 * class. The mutation entry point (`setDrawCount`) stays on the
 * concrete `WastePile` — only the app's restart path needs it, and
 * it owns the concrete model directly.
 */
export interface IWastePile extends IPile {
  readonly drawCount: number;
}
