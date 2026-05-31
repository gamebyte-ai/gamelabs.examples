import type { SlotType } from "../constants/SlotType";
import type { ICard } from "./Card";
import type { StackingOffset } from "./StackingOffset";

/**
 * Read-only view of a board pile. Exposes the pile's identity, layout,
 * cards, and the polymorphic predicates that encode Klondike rules.
 */
export interface IPile {
  readonly type: SlotType;
  readonly worldX: number;
  readonly worldZ: number;
  readonly stackingOffset: StackingOffset;
  readonly cards: readonly ICard[];
  readonly topCard: ICard | null;
  canPlace(cards: readonly ICard[]): boolean;
  canDragFrom(index: number): boolean;
  needsAutoFlipNewTop(): boolean;
  /** Offset of the card at `index` relative to the pile's origin, in
   *  world units. Default: linear `stackingOffset × index`. Piles may
   *  override (e.g. waste fans only its top draw batch). */
  getCardOffset(index: number): { readonly x: number; readonly z: number };
}
