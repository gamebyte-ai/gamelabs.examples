import type { IPile } from "../models/IPile";

export interface BoardContentBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Computes the axis-aligned world-space bounds of the board's current
 * content — pile rectangles plus the card-fan extension implied by
 * each pile's `getCardOffset(lastIndex)`. Used by the app to fit the
 * top-down camera around whatever the board currently shows.
 */
export class BoardBoundsCalculator {
  public static compute(piles: readonly IPile[], slotWidth: number, slotHeight: number): BoardContentBounds | null {
    if (piles.length === 0) return null;
    const halfW = slotWidth / 2;
    const halfH = slotHeight / 2;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const pile of piles) {
      const lastIndex = Math.max(0, pile.cards.length - 1);
      const offset = pile.getCardOffset(lastIndex);
      const fanX = pile.worldX + offset.x;
      const fanZ = pile.worldZ + offset.z;
      minX = Math.min(minX, pile.worldX - halfW, fanX - halfW);
      maxX = Math.max(maxX, pile.worldX + halfW, fanX + halfW);
      minZ = Math.min(minZ, pile.worldZ - halfH, fanZ - halfH);
      maxZ = Math.max(maxZ, pile.worldZ + halfH, fanZ + halfH);
    }

    return { minX, maxX, minZ, maxZ };
  }
}
