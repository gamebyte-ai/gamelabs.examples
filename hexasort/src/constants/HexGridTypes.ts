/**
 * World-space centre position of a hex cell, produced by the grid's
 * projection.
 */
export type HexCellPosition = { readonly x: number; readonly y: number; readonly z: number };

/**
 * Axis-aligned bounding box of the rendered hex grid in world units.
 */
export type HexGridBounds = { readonly width: number; readonly depth: number };
