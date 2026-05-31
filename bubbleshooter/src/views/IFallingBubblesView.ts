import type { IView } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";

/**
 * Mid-fall debris layer. Each bubble in flight after a disconnect or
 * threshold pop is identified by its ops-side `id`. Spawn/update with
 * a colour + position; pass `color = null` to remove the mesh.
 */
export interface IFallingBubblesView extends IView {
  setFallingBubble(id: number, color: BubbleColor | null, x: number, y: number): void;
}
