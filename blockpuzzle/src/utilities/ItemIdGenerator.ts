/**
 * Monotonic item-id allocator shared between the spawn pipeline and
 * the placement pipeline.
 *
 * Every framework `GridItem` needs a unique `itemId`. The initial deal
 * mints K ids for the tray pieces; each placement mints N more for
 * the N grid items the piece decomposes into. A single allocator
 * across both keeps ids globally unique without callers having to
 * thread a running counter through every function call.
 *
 * Bound as a singleton in `BlockPuzzleApp.configureDI`; resolved by
 * everything that creates `GameBoardItem`s.
 */
export class ItemIdGenerator {
  private _next = 1;

  public allocate(): number {
    return this._next++;
  }
}
