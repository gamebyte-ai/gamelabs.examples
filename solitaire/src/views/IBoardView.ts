import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IBoardModel } from "../models/IBoardModel";
import type { IPile } from "../models/IPile";

export interface CardsDragReleaseInfo {
  readonly originPile: IPile;
  readonly fromIndex: number;
  readonly targetPile: IPile | null;
}

export interface CardClickedInfo {
  readonly pile: IPile;
  readonly fromIndex: number;
}

export type DragEligibilityPredicate = (pile: IPile, fromIndex: number) => boolean;

export interface IBoardView extends IView {
  bindBoard(model: IBoardModel): void;
  refresh(): void;
  /** Animate the dragged stack from its release position to its
   *  destination in the current model state, then rebuild. The
   *  controller calls this in response to drag-release (snap-back or
   *  successful move) instead of {@link refresh}, so the cards do
   *  not snap instantly. If `autoFlippedCardId` is non-null, the
   *  view plays a flip animation on that card after the drag-release
   *  settles and before rebuilding (controller already mutated the
   *  card's face state to face-up). */
  commitDragRelease(autoFlippedCardId: number | null): void;
  /** Animate the card with `cardId` from its current rendered
   *  position to its destination in the current model state, then
   *  rebuild. Used for quick-placement (auto-route on click); has a
   *  faster, slightly arced trajectory distinct from the player-driven
   *  drag-release animation. If `autoFlippedCardId` is non-null, the
   *  view plays a flip animation on that card after the placement
   *  lands and before rebuilding. */
  animateQuickPlacement(cardId: number, autoFlippedCardId: number | null): void;
  /** Small side-to-side wiggle on the card to signal that a click
   *  had nowhere to go (no legal quick-placement target). Card
   *  returns to its resting position; no model mutation. */
  animateDeniedShake(cardId: number): void;
  /** Animate the reverse of a move that was just undone in the model:
   *  the top `count` cards of `originPile` (where they sit post-undo)
   *  fly from their previous visual positions back to their new
   *  resting positions. If `autoFlippedCardId` is non-null, that card
   *  is un-flipped (face-up → face-down) before the move animation,
   *  mirroring the original move-then-autoflip order in reverse. */
  playUndoMove(originPile: IPile, count: number, autoFlippedCardId: number | null): void;
  /** True while any animation (drag-release, quick placement, deal,
   *  flip, denied shake, undo) is in flight. The HUD undo button
   *  reads this to skip undo requests that would clash with a running
   *  animation. */
  isAnimating(): boolean;
  /** True while a stock→waste draw animation is in flight. Tracked
   *  separately from {@link isAnimating} so general board input keeps
   *  working during the draw — only the stock-tap and undo paths
   *  consult this flag and skip themselves. */
  isDrawAnimating(): boolean;
  /** Animate the listed waste cards from their fan positions back to
   *  the stock pile. Each card flips face-down mid-slide (mirror of
   *  the stock-draw flip) and lands stacked at stock. Cards run in
   *  parallel — same idiom as the Turn 3 draw, just reversed. The
   *  view refreshes itself when every tween has landed, then calls
   *  `onComplete`. Like the draw animation, this does not register
   *  with the global `isAnimating` gate; see {@link isRecycleAnimating}. */
  playRecycleAnimation(recycledCardIds: readonly number[], onComplete: () => void): void;
  /** True while a waste→stock recycle animation is in flight, or its
   *  undo (which reuses the same gating timeline). Same role as
   *  {@link isDrawAnimating} — only the stock-tap and undo paths
   *  consult it. */
  isRecycleAnimating(): boolean;
  /** Animate the reverse of a recycle in two sequential phases:
   *  (1) every card flies as a single stacked column from stock to
   *  the base of the waste with a face-up flip, then (2) the top
   *  drawCount cards spread out into their fan offsets. Shares the
   *  recycle timeline (see {@link isRecycleAnimating}) and refreshes
   *  the view on landing. */
  playRecycleUndoAnimation(cardIds: readonly number[], onComplete: () => void): void;
  /** One-shot game-start animation. Stacks the listed cards (in
   *  Klondike deal order) on top of the stock pile, then sequentially
   *  flies each one to its model-resting position face-down, and
   *  finally flips the top of each tableau column face-up. Calls
   *  `onComplete` after the last flip. Pointer input is blocked for
   *  the duration via the view's existing animation gate. */
  playDealAnimation(orderedCardIds: readonly number[], onComplete: () => void): void;
  /** Animate cards from the stock pile to the waste pile after a
   *  stock-tap draw. Each card slides + flips (face-down → face-up)
   *  in one continuous motion; in Turn 3 the cards stagger so they
   *  overlap in flight. The view refreshes itself when every tween
   *  has landed, then calls `onComplete`. Unlike the other animations
   *  this one does NOT register with the global `isAnimating` gate
   *  — only the stock-tap and undo-request paths should be blocked
   *  while it runs (see {@link isDrawAnimating}); other input on
   *  the board stays live. */
  playDrawAnimation(drawnCardIds: readonly number[], onComplete: () => void): void;
  onCardsDragReleased(callback: (info: CardsDragReleaseInfo) => void): Unsubscribe;
  /** Fired on a tap (pointer-down then pointer-up with no significant
   *  pointer movement) over a face-up card that passed the drag
   *  eligibility check. The drag itself never starts, so the card was
   *  never visually lifted. */
  onCardClicked(callback: (info: CardClickedInfo) => void): Unsubscribe;
  onPileTapped(callback: (pile: IPile) => void): Unsubscribe;
  setDragEligibilityPredicate(predicate: DragEligibilityPredicate | null): void;
}
