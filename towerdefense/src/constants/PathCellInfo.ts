/**
 * Metadata about a single cell along the enemy path. Produced by
 * {@link import("../utilities/LevelManager.js").LevelManager} when it
 * generates a new level.
 */
export interface PathCellInfo {
  /** true when the path changes direction at this cell. */
  readonly isTurn: boolean;
  /** true for right-hand turns, false for left or straight. */
  readonly isRightTurn: boolean;
  /** Mesh rotation.y to align the directional texture with the path. */
  readonly rotation: number;
}
