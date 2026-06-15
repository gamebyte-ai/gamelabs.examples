import type { GridCoord, IGridView, IParticleEmitter, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { GameBoardItem } from "../models/GameBoardItem";

/**
 * Information emitted when the player releases a piece over the
 * playing grid in a position that the {@link PiecePlacementPredicate}
 * accepted. The controller is the one that actually mutates the
 * model — view stays render-only.
 */
export interface PiecePlacementInfo {
  /** Tray column the piece came from. */
  readonly trayCol: number;
  /** Tray item being placed (carries `pieceType` + `color`). */
  readonly item: GameBoardItem;
  /** Cells on the playing grid the piece should occupy. */
  readonly footprint: readonly GridCoord[];
}

/**
 * Validity predicate the view consults during drag to decide
 * whether the ghost reads as a legal placement, and on drop to
 * decide whether to emit a placement event or snap the piece back.
 *
 * The controller owns the predicate (it has the rules / model
 * access); the view only knows footprint coords.
 */
export type PiecePlacementPredicate = (footprint: readonly GridCoord[]) => boolean;

/**
 * Predictive clear-preview result. `cells` are every cell that
 * would clear (full row + full column union); `fullRows` /
 * `fullCols` are the line indices that triggered the clear. The
 * view paints `cells` in the piece's colour and frames each
 * `fullRows` / `fullCols` line with a glowing outline.
 *
 * Empty `cells` AND empty rows/cols means nothing would clear.
 */
export interface ClearPreviewResult {
  readonly cells: readonly GridCoord[];
  readonly fullRows: readonly number[];
  readonly fullCols: readonly number[];
}

/**
 * Predictive clears for the ghost preview. The view calls this
 * with the candidate footprint and the controller returns the
 * cells + line indices that *would* be cleared if the player
 * dropped here.
 */
export type ClearPreviewProvider = (footprint: readonly GridCoord[]) => ClearPreviewResult;

/**
 * Per-slot placeability map. Keyed by tray column; missing entries
 * default to "placeable" (no fade). The view dims any slot whose
 * entry is `false`.
 */
export type TrayPlaceability = ReadonlyMap<number, boolean>;

/**
 * View interface for the boards world view. Adds drag-driven piece
 * placement on top of the framework's `IGridView` auto-sync surface.
 */
export interface IGameBoardsView extends IGridView {
  /** Install / clear the validity predicate. Pass `null` to disable
   *  drag interaction entirely (the view still renders). */
  setPlacementPredicate(predicate: PiecePlacementPredicate | null): void;
  /** Install / clear the clear-preview provider. Without one the
   *  ghost only shows footprint cells (no line highlight). */
  setClearPreviewProvider(provider: ClearPreviewProvider | null): void;
  /** Master toggle for drag interaction. When `false`,
   *  pointer-down on tray pieces is ignored — used by the game-over
   *  state and during booster Selecting. Default is `true`. */
  setDragEnabled(enabled: boolean): void;
  /** Master toggle for grid-cell tap detection. When `true`, a
   *  pointer-down + pointer-up on the same cell with negligible
   *  pointer movement fires {@link onGridCellTapped}. Drag and
   *  cell-tap are mutually exclusive — flip drag off while turning
   *  cell-tap on (used by the Hammer booster target-selection). */
  setCellTapEnabled(enabled: boolean): void;
  /** Update the per-slot placeable / unplaceable state. Unplaceable
   *  slots render with the faded opacity from
   *  `BlockPuzzleConfig.trayUnplaceableOpacity`; placeable slots
   *  render fully opaque. Pass `null` to clear all fades. */
  setTrayPlaceability(perSlot: TrayPlaceability | null): void;
  /** Fired on pointer-up when the dragged piece passed
   *  {@link PiecePlacementPredicate}. Invalid drops snap the piece
   *  back to its tray slot inside the view and do not fire this. */
  onPiecePlacement(callback: (info: PiecePlacementInfo) => void): Unsubscribe;
  /** Fired when {@link setCellTapEnabled} is true and the player
   *  taps a grid cell (pointer-down + pointer-up at the same cell
   *  with negligible movement). Used by target-selection boosters
   *  (Hammer) to pick the target cell. */
  onGridCellTapped(callback: (col: number, row: number) => void): Unsubscribe;
  /** Apply a vertical gradient to the Three.js scene background.
   *  `top` paints the top edge of the viewport, `bottom` the bottom.
   *  The boards controller uses this to dim the screen behind the
   *  grid while a target-selection booster is pending. */
  setBackgroundGradient(top: number, bottom: number): void;
  /** Particle emitter for Hammer destruction bursts. The controller
   *  registers it with `ParticleManager` so the framework ticks it
   *  every frame, and calls {@link emitHammerBurst} to fire one. */
  readonly hammerEmitter: IParticleEmitter;
  /** Continuous sparkle emitter around the Unit Block temp piece.
   *  The controller registers it with `ParticleManager`; the view
   *  toggles its emission rate on / off as the temp piece appears
   *  / hides (drag begin) / is removed. */
  readonly unitBlockSparkleEmitter: IParticleEmitter;
  /** Fire a one-shot Hammer particle burst at a grid cell. Passes
   *  through to the emitter with the destroyed block's colour so the
   *  particles inherit it. */
  emitHammerBurst(col: number, row: number, color: number): void;
  /** Apply the Hammer-Selecting wobble to every grid block, sampling
   *  a `sin` rotation at `time`. Pass `null` to snap blocks back to
   *  resting rotation (called on Selecting exit). The view manages
   *  per-block phase persistence internally. */
  setHammerWobble(time: number | null): void;
  /** Enter Unit Block booster mode. Hides every tray-piece visual
   *  and spawns a single 1-cell block at `(worldX, worldZ)` in
   *  `color`. The player drags this temp block through the standard
   *  drag pipeline; on valid drop it fires
   *  {@link onUnitBlockPlacement}. Idempotent re-entry restores
   *  position. */
  enterUnitBlockMode(color: number, worldX: number, worldZ: number): void;
  /** Exit Unit Block mode. Discards the temp 1-cell visual,
   *  restores every tray-piece visual. Cancels any in-flight drag
   *  of the temp block. Idempotent. */
  exitUnitBlockMode(): void;
  /** Set placeable / unplaceable styling on the Unit Block temp
   *  visual — same effect `setTrayPlaceability` has on per-slot tray
   *  pieces. No-op when Unit Block mode is not active. */
  setUnitBlockPlaceable(placeable: boolean): void;
  /** Fires on pointer-up when the temp Unit Block was dropped on a
   *  valid empty grid cell. `footprint` is the single
   *  `{col, row}` the block lands on. The controller places a 1-cell
   *  grid item there and consumes the booster. */
  onUnitBlockPlacement(callback: (footprint: readonly GridCoord[]) => void): Unsubscribe;
  /** Apply an impact-shake transform to the playing grid (cells +
   *  the panel + separator children of its `GridObject`). The
   *  controller drives random per-frame offset + rotation values;
   *  `0, 0, 0` snaps the grid back to its layout-resolved base
   *  position and rotation. */
  setGridShakeTransform(offsetX: number, offsetZ: number, rotationY: number): void;
  /** Slide every currently-occupied tray item off-screen left
   *  (staggered by column) and fire `onComplete` once the last
   *  item finishes. Items remain non-interactable during the
   *  slide via the pickup raycast skipping them. The caller is
   *  expected to do its model-side cleanup + re-deal inside the
   *  callback; the entry animation for the new hand starts
   *  automatically from `createItem`. No-op if the tray is
   *  already empty (callback still fires). */
  beginTrayExit(onComplete: () => void): void;
  /** Per-frame tick that advances any in-flight tray entry / exit
   *  animations. The boards controller invokes this from its
   *  `UpdateManager.register` callback. */
  tickTrayAnimations(dt: number): void;
}
