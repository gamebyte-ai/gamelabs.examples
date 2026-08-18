import type { IView } from "@gamebyte/gamelabsjs";

/** The 3D brick grid: square blocks stacked from the bottom, descending one step
 * per tap. */
export interface IGridView extends IView {
  /** Descend the whole grid one row (animated). No-op while already animating. */
  descend(): void;
  /** Per-frame ball physics tick (driven by the controller's UpdateManager). */
  update(dtSeconds: number): void;
}
