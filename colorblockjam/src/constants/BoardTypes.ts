/**
 * Grid cell coordinate. `col` is the X axis, `row` is the Z axis. Origin 0.
 */
export type CellCoord = { readonly col: number; readonly row: number };

/** Edge of the grid a door sits on. */
export type DoorSide = "top" | "bottom" | "left" | "right";
