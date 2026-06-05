import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Physics2DEntityView } from "@gamebyte/gamelabsjs/physics2d";
import type { PieceKind, PieceShape } from "../models/IGameModel.js";

/**
 * The World (3D) view that renders the 2D game objects. It makes the mesh for a
 * spawned entity, draws the aim line, and reports pointer input in design-space
 * (matter) coordinates. It never reads the physics world — `createEntity`
 * returns the `Physics2DEntityView` adapter the stage drives.
 */
export interface IGameView extends IView {
  /** Create the mesh for an entity and return the adapter the stage syncs (design-space transforms). */
  createEntity(kind: PieceKind, shape: PieceShape): Physics2DEntityView;

  /** Draw / clear the aim line, given design-space coordinates. */
  setAim(originX: number, originY: number, targetX: number, targetY: number): void;
  clearAim(): void;

  // Pointer input, reported in design-space (matter) coordinates.
  onAimMove(cb: (x: number, y: number) => void): Unsubscribe;
  onAimRelease(cb: (x: number, y: number) => void): Unsubscribe;
}
