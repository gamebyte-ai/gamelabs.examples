import type { CellCoord, DoorSide } from "./BoardTypes.js";

/**
 * Grid-space pointer position reported by the board view. `col`/`row`
 * are float cell coordinates (X / Z in world space).
 */
export type GridPointer = { readonly col: number; readonly row: number };

/**
 * Continuous (float) position in cell coordinates — used by
 * {@link import("../utilities/GameOperations.js").GameOperations}
 * during the per-frame drag tick.
 */
export type FloatPos = { readonly col: number; readonly row: number };

/**
 * Door match + which side it's on + the snapped anchor cell the block
 * should occupy before the exit animation plays. Both the drag-time
 * auto-trigger and the on-release commit return this shape so the
 * controller can snap visuals before tweening.
 */
export type ExitMatch = {
  readonly doorId: number;
  readonly side: DoorSide;
  readonly anchor: CellCoord;
};

/**
 * Outcome of a pointer-release commit. `"rest"` snaps the block to the
 * nearest legal cell; `"exit"` starts the gate exit animation.
 */
export type CommitResult =
  | { readonly kind: "rest"; readonly anchor: CellCoord }
  | {
      readonly kind: "exit";
      readonly doorId: number;
      readonly side: DoorSide;
      readonly anchor: CellCoord;
    };
