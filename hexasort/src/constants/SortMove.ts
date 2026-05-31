import type { HexCoord } from "./HexCoord.js";

/**
 * Single block transfer produced by {@link import("../utilities/SortOperations.js").SortOperations}.
 * The scheduler enacts these one block at a time during merge chains.
 */
export type SortMove = {
  readonly source: HexCoord;
  readonly target: HexCoord;
  readonly color: number;
};
