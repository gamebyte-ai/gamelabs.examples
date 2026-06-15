import type { RectGrid } from "@gamebyte/gamelabsjs";
import type { PieceCells, PieceType } from "../BlockPuzzleConfig";
import { GameBoardItem } from "../modules/gamegrid/models/GameBoardItem";
import { ItemIdGenerator } from "./ItemIdGenerator";

/**
 * Piece-spawn operations on top of the framework's grid model.
 *
 * Used twice in the player's flow:
 * - **Initial deal** (game start): all three slots are empty, one
 *   piece dropped into each.
 * - **Refill** (after the player empties the tray): same operation,
 *   precondition is the same (every slot empty).
 *
 * Per-spawn picks:
 * - Piece type: uniform random with replacement from the catalog
 *   (same piece can appear in multiple slots) — with one guard:
 *   the last slot in a deal must differ from the previous picks if
 *   they were all the same, so a hand is never K-of-a-kind. Two
 *   matching pieces in a hand is still allowed.
 * - Rotation: uniform random from the piece type's de-duplicated
 *   rotation pool ({@link BlockPuzzleConfig.rotatedShapes}). Symmetric
 *   shapes pick from a smaller pool so a square rotation isn't
 *   four-times-over-represented vs an L-shape rotation.
 * - Block colour: uniform random without replacement from the
 *   palette (K distinct colours per K tray slots).
 *
 * The framework auto-renders each spawn: `addCellItem` emits
 * `onItemAdded`, the boards controller forwards `item.cells` to the
 * visual, and the world view instantiates a `GameBoardItemObject`
 * with the (possibly rotated) shape.
 */
export class PieceSpawnOperations {
  /**
   * Fill every slot in `tray` with one piece. Throws if any slot is
   * already occupied, if the piece catalog is empty, or if
   * `blockColors` has fewer entries than the tray has slots.
   */
  public static dealHand(
    tray: RectGrid,
    pieceTypes: readonly PieceType[],
    rotatedShapes: ReadonlyMap<PieceType, readonly PieceCells[]>,
    blockColors: readonly number[],
    ids: ItemIdGenerator,
  ): void {
    if (pieceTypes.length === 0) {
      throw new Error("PieceSpawnOperations: piece catalog is empty");
    }
    if (blockColors.length < tray.columnCount) {
      throw new Error(`PieceSpawnOperations: blockColors has ${blockColors.length} entries but tray has ${tray.columnCount} slots — need at least one colour per slot`);
    }
    const colorPool = PieceSpawnOperations.sampleDistinct(blockColors, tray.columnCount);
    const picked: PieceType[] = [];
    for (let col = 0; col < tray.columnCount; col++) {
      // Avoid hands that are all the same piece type. The constraint
      // only kicks in on the last slot — earlier slots are free to
      // match (two of three matching is still possible) — and only
      // when the catalog has alternatives to choose from.
      const isLastSlot = col === tray.columnCount - 1;
      const allPrevSame = picked.length > 0 && picked.every((p) => p === picked[0]);
      const forceDiffer = isLastSlot && allPrevSame && pieceTypes.length > 1;
      const pieceType = forceDiffer
        ? PieceSpawnOperations.pickRandomExcluding(pieceTypes, picked[0]!)
        : PieceSpawnOperations.pickRandom(pieceTypes);
      picked.push(pieceType);
      const rotations = rotatedShapes.get(pieceType);
      if (!rotations || rotations.length === 0) {
        throw new Error(`PieceSpawnOperations: no rotation pool for piece type "${pieceType.name}"`);
      }
      const cells = PieceSpawnOperations.pickRandom(rotations);
      const color = colorPool[col]!;
      tray.addCellItem(col, 0, new GameBoardItem(ids.allocate(), pieceType, cells, color));
    }
  }

  /** Uniform random pick from a non-empty list. */
  private static pickRandom<T>(pool: readonly T[]): T {
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  /** Uniform random pick from `pool` excluding any entry equal to
   *  `exclude` by reference. Caller must guarantee the filtered pool
   *  is non-empty (the constraint here is `pool.length > 1` plus the
   *  exclude appearing once). */
  private static pickRandomExcluding<T>(pool: readonly T[], exclude: T): T {
    const filtered = pool.filter((x) => x !== exclude);
    return PieceSpawnOperations.pickRandom(filtered);
  }

  /** Pick `count` distinct entries from `pool` uniformly at random.
   *  Partial Fisher-Yates shuffle on a copy — O(count) swaps, no
   *  collision retries. Caller must guarantee `pool.length >= count`. */
  private static sampleDistinct<T>(pool: readonly T[], count: number): T[] {
    const copy = pool.slice();
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy.slice(0, count);
  }
}
