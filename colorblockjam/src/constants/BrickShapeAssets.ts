import { ColorBlockJamAssetIds } from "../ColorBlockJamAssetIds.js";
import type { CellCoord } from "./BoardTypes.js";
import { SHAPES } from "./LevelSchema.js";

/**
 * Canonical signature of a shape's cells — used to map a block's
 * cell-set back to the asset id of the matching GLB model, regardless
 * of the order cells were listed in the level descriptor.
 */
function shapeSignature(shape: readonly CellCoord[]): string {
  const keys: string[] = [];
  for (const c of shape) keys.push(`${c.col},${c.row}`);
  keys.sort();
  return keys.join("|");
}

const SIGNATURE_TO_ASSET_ID: ReadonlyMap<string, ColorBlockJamAssetIds> = new Map([
  [shapeSignature(SHAPES.square1x1), ColorBlockJamAssetIds.BrickSquare1x1],
  [shapeSignature(SHAPES.rect1x2), ColorBlockJamAssetIds.BrickRect1x2],
  [shapeSignature(SHAPES.rect1x3), ColorBlockJamAssetIds.BrickRect1x3],
  [shapeSignature(SHAPES.square2x2), ColorBlockJamAssetIds.BrickSquare2x2],
  [shapeSignature(SHAPES.lShape), ColorBlockJamAssetIds.BrickLShape],
]);

/**
 * Returns the asset id for the GLB model that matches `shape`, or
 * `null` when the shape has no pre-baked model.
 */
export function resolveBrickAssetId(shape: readonly CellCoord[]): ColorBlockJamAssetIds | null {
  return SIGNATURE_TO_ASSET_ID.get(shapeSignature(shape)) ?? null;
}
