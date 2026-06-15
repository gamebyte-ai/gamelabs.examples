/**
 * Structural seam: where the next piece to place comes from.
 *
 * The example has no pieces yet — step 1 is the static grid + tray
 * layout only. This interface is named (not implemented) so the next
 * step can plug in a concrete source without restructuring the board
 * layer or the controllers that will read from it.
 *
 * Planned variants:
 * - **Tray-backed** (step 2): the K tray slots each hold a piece; the
 *   player picks one, and the slot is refilled when the hand empties.
 *   This is the initial Block Blast / 1010! mode.
 * - **Falling-piece**: one piece auto-advances from above on a timer
 *   (Tetris-flavoured variant).
 * - **Inventory**: pieces are purchased or earned, drawn one at a
 *   time from a persistent stash.
 *
 * Methods will be filled in alongside the first concrete piece type,
 * so the surface here only captures the seam intent — `isEmpty()`
 * gates the spawn pipeline regardless of which source is wired.
 */
export interface ISpawnSource {
  /** True when no more pieces are available right now. The board
   *  controller will read this in step 2 to decide whether to wait
   *  for a refill, end the game, or advance the falling timer. */
  isEmpty(): boolean;
}
