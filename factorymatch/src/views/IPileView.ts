import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Physics3DEntityView } from "@gamebyte/gamelabsjs/physics3d";
import type { CollectResult } from "../utilities/FactoryOperations.js";
import type { Kind } from "../models/IGameModel.js";

/**
 * The World (3D) view: renders the bin + pile shapes, reports which pile body the
 * player clicked (resolved by a precise mesh raycast), and animates collected
 * shapes flying into the 3D slot rack. It never reads the physics world.
 */
export interface IPileView extends IView {
  /** Mesh for a physics-driven pile shape; the stage drives the returned adapter. */
  createEntity(kind: Kind): Physics3DEntityView;

  /** Animate a picked shape flying from the pile into its slot, and pop any match. */
  applyCollect(result: CollectResult): void;

  /** Remove all slotted shapes (on restart). */
  clearSlots(): void;

  /** A pointer click: the picked pile body id, or null if none was under the pointer. */
  onPick(cb: (bodyId: number | null) => void): Unsubscribe;
}
