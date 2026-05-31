/**
 * Visual offset applied to each successive card in a pile's stack, in
 * world units along the board plane. Stock / waste / foundation use a
 * zero offset (cards pile flush); tableau fans the stack along +Z.
 */
export interface StackingOffset {
  readonly x: number;
  readonly z: number;
}

export const FLUSH_STACK: StackingOffset = { x: 0, z: 0 };
export const TABLEAU_STACK: StackingOffset = { x: 0, z: 0.28 };
