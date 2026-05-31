import * as THREE from "three";
import gsap from "gsap";
import type { IBoardModel } from "../models/IBoardModel";
import type { IPile } from "../models/IPile";
import type { SolitaireConfig } from "../SolitaireConfig";
import { CARD_STACK_LIFT_Y, DRAG_CARD_SUBLIFT_Y, DRAG_LIFT_Y } from "../constants/BoardLayout";
import type { CardObject } from "./CardObject";

export interface CardLookupEntry {
  readonly pile: IPile;
  readonly indexInPile: number;
  readonly faceUp: boolean;
  readonly cardObject: CardObject;
}

/**
 * Owns every GSAP timeline that drives the solitaire board's
 * scene-side animation (drag-release, quick-placement, denied shake,
 * undo move, deal, stock-draw, recycle, recycle-undo, auto-flip
 * reveal). The view delegates here; the animator only reads the
 * card lookup + the model + the config, and tweens cardObject
 * transforms.
 *
 * Lifetime mirrors the bound board: the view constructs an animator
 * once the model and scene roots are ready (`bindBoard`) and calls
 * {@link killAll} on teardown.
 */
export class BoardAnimator {
  private readonly _cardLookup: Map<number, CardLookupEntry>;
  private readonly _config: SolitaireConfig;
  private readonly _board: IBoardModel;
  private readonly _cardsRoot: THREE.Group;
  private readonly _dragRoot: THREE.Group;
  private readonly _refresh: () => void;

  private _releaseTween: gsap.core.Timeline | null = null;
  private _quickPlacementTween: gsap.core.Timeline | null = null;
  private _dealTimeline: gsap.core.Timeline | null = null;
  private _flipTimeline: gsap.core.Timeline | null = null;
  private _deniedTween: gsap.core.Timeline | null = null;
  private _undoTimeline: gsap.core.Timeline | null = null;
  private _drawTimeline: gsap.core.Timeline | null = null;
  private _recycleTimeline: gsap.core.Timeline | null = null;

  public constructor(
    cardLookup: Map<number, CardLookupEntry>,
    config: SolitaireConfig,
    board: IBoardModel,
    cardsRoot: THREE.Group,
    dragRoot: THREE.Group,
    refresh: () => void,
  ) {
    this._cardLookup = cardLookup;
    this._config = config;
    this._board = board;
    this._cardsRoot = cardsRoot;
    this._dragRoot = dragRoot;
    this._refresh = refresh;
  }

  /** True while any "blocking" animation is in flight — those that
   *  the view's pointer handlers gate themselves against. Draw and
   *  recycle animations are NOT included; they expose their own
   *  flags so the rest of the board stays interactive. */
  public isAnimating(): boolean {
    return (
      this._releaseTween !== null ||
      this._quickPlacementTween !== null ||
      this._dealTimeline !== null ||
      this._flipTimeline !== null ||
      this._deniedTween !== null ||
      this._undoTimeline !== null
    );
  }

  public isDrawAnimating(): boolean {
    return this._drawTimeline !== null;
  }

  public isRecycleAnimating(): boolean {
    return this._recycleTimeline !== null;
  }

  /** Kill every owned timeline. Called by the view on refresh (which
   *  rebuilds the scene under the timelines' feet) and on teardown. */
  public killAll(): void {
    this._releaseTween?.kill();
    this._releaseTween = null;
    this._quickPlacementTween?.kill();
    this._quickPlacementTween = null;
    this._dealTimeline?.kill();
    this._dealTimeline = null;
    this._flipTimeline?.kill();
    this._flipTimeline = null;
    this._deniedTween?.kill();
    this._deniedTween = null;
    this._undoTimeline?.kill();
    this._undoTimeline = null;
    this._drawTimeline?.kill();
    this._drawTimeline = null;
    this._recycleTimeline?.kill();
    this._recycleTimeline = null;
  }

  public commitDragRelease(bottomCardId: number, autoFlippedCardId: number | null): void {
    const target = this.findCardWorldPosition(bottomCardId);
    if (!target) {
      this._refresh();
      return;
    }
    const releaseCfg = this._config.animation.dragRelease;
    // The bottom card sits at local y = DRAG_CARD_SUBLIFT_Y in the
    // drag root; to make it land at exactly target.y in world space
    // (matching the resting Y the post-animation refresh will use),
    // animate the drag root's y to target.y - DRAG_CARD_SUBLIFT_Y.
    // Eliminates the brief world-Y discontinuity at refresh that can
    // tip a tight depth comparison the wrong way and let an adjacent
    // fan neighbour render over the dragged card for a frame.
    this._releaseTween?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this._releaseTween = null;
        this.playAutoFlipThenRefresh(autoFlippedCardId);
      },
    });
    tl.to(
      this._dragRoot.position,
      {
        x: target.x,
        y: target.y - DRAG_CARD_SUBLIFT_Y,
        z: target.z,
        duration: releaseCfg.duration,
        ease: releaseCfg.ease,
      },
      0,
    );
    // When the drag emptied a waste fan slot, the remaining waste
    // cards shift right to keep the top-3 window populated. The
    // animation rides the same release config so it lands in sync
    // with the dragged stack arriving at its new home.
    this.appendWasteFanShifts(tl, 0, releaseCfg.duration, releaseCfg.ease);
    this._releaseTween = tl;
  }

  public animateQuickPlacement(cardId: number, autoFlippedCardId: number | null): void {
    const entry = this._cardLookup.get(cardId);
    const target = this.findCardWorldPosition(cardId);
    if (!entry || !target) {
      this._refresh();
      return;
    }
    const cardObject = entry.cardObject;
    const quickCfg = this._config.animation.quickPlacement;
    // Instant lift to a constant Y for the entire flight (invisible
    // under the top-down ortho camera) so the card stays above any
    // resting cards its XZ trajectory crosses. The resting Y is
    // restored by the post-animation refresh, so the Y snap at the
    // end has no visible cost. Replaces the earlier three-tween arc,
    // which produced a single-frame jitter at the halfway hand-off
    // between the lift-up and lift-down sub-tweens.
    cardObject.position.y = quickCfg.liftY;
    this._quickPlacementTween?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this._quickPlacementTween = null;
        this.playAutoFlipThenRefresh(autoFlippedCardId);
      },
    });
    tl.to(
      cardObject.position,
      {
        x: target.x,
        z: target.z,
        duration: quickCfg.duration,
        ease: quickCfg.ease,
      },
      0,
    );
    // Mirror of the drag-release fan shift: a quick-place out of the
    // waste also pops the top, so the remaining cards (plus any
    // newly-uncovered older card) slide into the freed fan slot in
    // step with the placed card's flight.
    this.appendWasteFanShifts(tl, 0, quickCfg.duration, quickCfg.ease);
    this._quickPlacementTween = tl;
  }

  public animateDeniedShake(cardId: number): void {
    const entry = this._cardLookup.get(cardId);
    if (!entry) return;
    const cardObject = entry.cardObject;
    const originX = cardObject.position.x;
    const cfg = this._config.animation.deniedShake;
    // Four equal segments traversing 0 → +amp → −amp → +amp → 0,
    // settling back at the card's original X with no model change.
    const segDuration = cfg.duration / 4;
    this._deniedTween?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        cardObject.position.x = originX;
        this._deniedTween = null;
      },
    });
    tl.to(cardObject.position, { x: originX + cfg.amplitude, duration: segDuration, ease: cfg.ease });
    tl.to(cardObject.position, { x: originX - cfg.amplitude, duration: segDuration, ease: cfg.ease });
    tl.to(cardObject.position, { x: originX + cfg.amplitude, duration: segDuration, ease: cfg.ease });
    tl.to(cardObject.position, { x: originX, duration: segDuration, ease: cfg.ease });
    this._deniedTween = tl;
  }

  public playUndoMove(originPile: IPile, count: number, autoFlippedCardId: number | null): void {
    // The cards to fly back are now the top `count` of `originPile`
    // (post-undo model). Their cardObjects are still positioned at
    // their pre-undo visual rest (on the original target pile); the
    // animation moves them from there to their new origin rest.
    const cards = originPile.cards.slice(originPile.cards.length - count);
    if (cards.length === 0 && autoFlippedCardId === null) {
      this._refresh();
      return;
    }
    const releaseCfg = this._config.animation.dragRelease;
    const autoFlipCfg = this._config.animation.autoFlip;
    this._undoTimeline?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this._undoTimeline = null;
        this._refresh();
      },
    });

    // Reverse-order playback: the original sequence was move-then-flip
    // (auto-flip reveal at the end), so undo plays unflip-then-move.
    // The un-flip uses the same duration as the original auto-flip.
    let time = 0;
    if (autoFlippedCardId !== null) {
      const entry = this._cardLookup.get(autoFlippedCardId);
      if (entry) {
        this.appendCardFlip(tl, entry.cardObject, time, false, autoFlipCfg.halfDuration);
        time += autoFlipCfg.halfDuration * 2;
      }
    }

    // Instant lift of every flying card to DRAG_LIFT_Y for the
    // duration of the move (invisible under top-down ortho but keeps
    // depth ordering safe over any cards the trajectories cross).
    // Refresh restores the resting Y after the animation lands.
    const undoneCardIds = new Set<number>();
    for (const card of cards) {
      const entry = this._cardLookup.get(card.id);
      if (!entry) continue;
      const target = this.findCardWorldPosition(card.id);
      if (!target) continue;
      undoneCardIds.add(card.id);
      tl.set(entry.cardObject.position, { y: DRAG_LIFT_Y }, time);
      tl.to(
        entry.cardObject.position,
        {
          x: target.x,
          z: target.z,
          duration: releaseCfg.duration,
          ease: releaseCfg.ease,
        },
        time,
      );
    }
    // Undoing a move out of the waste pushes a card back onto the
    // fan, so the already-present waste cards shift left to make room
    // in parallel with the returning card's flight. The undone cards
    // themselves are excluded — they're already animated above.
    this.appendWasteFanShifts(tl, time, releaseCfg.duration, releaseCfg.ease, undoneCardIds);
    this._undoTimeline = tl;
  }

  public playDealAnimation(orderedCardIds: readonly number[], onComplete: () => void): void {
    if (orderedCardIds.length === 0) {
      onComplete();
      return;
    }

    // Phase 1 (synchronous): stack every to-be-dealt card on top of
    // the stock pile face-down. Index 0 in the order sits at the
    // BOTTOM of the dealable batch (just above the older stock cards)
    // so it pulls out from underneath the still-intact top; the last
    // card in the order sits on top and is the last to move, keeping
    // the stock visually whole until the end of the deal. Runs before
    // the next frame is rendered, so the player never sees the
    // unanimated final-state layout.
    const stockX = this._board.stock.worldX;
    const stockZ = this._board.stock.worldZ;
    const stockBaseStackHeight = this._board.stock.cards.length;
    for (let i = 0; i < orderedCardIds.length; i++) {
      const entry = this._cardLookup.get(orderedCardIds[i]);
      if (!entry) continue;
      const stackY = (stockBaseStackHeight + (i + 1)) * CARD_STACK_LIFT_Y;
      entry.cardObject.position.set(stockX, stackY, stockZ);
      entry.cardObject.setFaceUp(false);
    }

    // Phase 2: continuous deal. Card N+1's position tween starts the
    // moment card N has landed; flips run in parallel — when a card
    // ends face-up, its flip is scheduled at its landing time but the
    // deal cursor does not wait for the flip to finish before
    // dispatching the next card. Each flip animates its own
    // cardObject.scale.x, so parallel flips on different cards don't
    // conflict. The timeline's natural duration covers the trailing
    // flip on the last face-up card.
    const dealCfg = this._config.animation.deal;
    this._dealTimeline?.kill();
    const dealTl = gsap.timeline({
      onComplete: () => {
        this._dealTimeline = null;
        onComplete();
      },
    });
    let time = 0;
    const phaseTotal = dealCfg.exit.duration + dealCfg.travel.duration;
    const exitFraction = phaseTotal > 0 ? dealCfg.exit.duration / phaseTotal : 0;
    for (const cardId of orderedCardIds) {
      const entry = this._cardLookup.get(cardId);
      if (!entry) continue;
      const target = this.findCardWorldPosition(cardId);
      if (!target) continue;
      const startX = entry.cardObject.position.x;
      const startY = entry.cardObject.position.y;
      const startZ = entry.cardObject.position.z;
      // Phase 1 — exit: cover the first `exitFraction` of the path
      // toward the destination on a direct line. No Y lift over the
      // stack: Y monotonically decreases from the card's stack
      // position toward its (small) tableau resting Y, so the card
      // never rises above its own starting Y and the topmost stock
      // card stays visually in place until its own iteration arrives.
      dealTl.to(
        entry.cardObject.position,
        {
          x: startX + (target.x - startX) * exitFraction,
          y: startY + (target.y - startY) * exitFraction,
          z: startZ + (target.z - startZ) * exitFraction,
          duration: dealCfg.exit.duration,
          ease: dealCfg.exit.ease,
        },
        time,
      );
      // Phase 2 — travel: completes the journey to the tableau
      // resting position. Independent duration and ease from exit.
      dealTl.to(
        entry.cardObject.position,
        {
          x: target.x,
          y: target.y,
          z: target.z,
          duration: dealCfg.travel.duration,
          ease: dealCfg.travel.ease,
        },
        time + dealCfg.exit.duration,
      );
      // The _cardLookup entry's faceUp is the model state captured by
      // the initial refresh — true for the top of each tableau, false
      // for everything else. Schedule the flip at landing time (after
      // both motion phases). Cursor advances by perCardDuration only,
      // so the flip's offset on the timeline is independent of the
      // sequence pacing.
      if (entry.faceUp) {
        this.appendCardFlip(dealTl, entry.cardObject, time + phaseTotal, true, dealCfg.flipHalfDuration);
      }
      time += dealCfg.perCardDuration;
    }
    this._dealTimeline = dealTl;
  }

  public playDrawAnimation(drawnCardIds: readonly number[], onComplete: () => void): void {
    if (drawnCardIds.length === 0) {
      this._refresh();
      onComplete();
      return;
    }
    const drawCfg = this._config.animation.draw;
    this._drawTimeline?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this._drawTimeline = null;
        // Refresh once everything has landed: the drawn cards' card
        // lookup entries are still stale (pile=stock, faceUp=false),
        // and the freshly settled visual matches the model so the
        // refresh has no visible cost.
        this._refresh();
        onComplete();
      },
    });

    for (let i = 0; i < drawnCardIds.length; i++) {
      const cardId = drawnCardIds[i];
      const entry = this._cardLookup.get(cardId);
      if (!entry) continue;
      const target = this.findCardWorldPosition(cardId);
      if (!target) continue;
      // All cards share the same start time when `staggerDelay` is 0
      // (Turn 3 — cards lift off simultaneously); a non-zero value
      // re-introduces a staggered sequence.
      const startTime = i * drawCfg.staggerDelay;
      // Instant-lift the card to DRAG_LIFT_Y so it stays above every
      // stock and waste card throughout the slide. Without this, the
      // tweened Y descends through the new top of stock about 7% into
      // the animation and the drawn card gets occluded by the new
      // stock top while it's still passing through the stock XZ
      // footprint — visually reading as "top of stock didn't move and
      // a card emerged from underneath." Y is invisible under top-down
      // ortho; the post-animation refresh restores the resting Y.
      entry.cardObject.position.y = DRAG_LIFT_Y;
      tl.to(
        entry.cardObject.position,
        {
          x: target.x,
          z: target.z,
          duration: drawCfg.duration,
          ease: drawCfg.ease,
        },
        startTime,
      );
      // Flip starts the moment the card leaves the stock and runs at
      // the draw-specific flipHalfDuration — kept short so the card
      // is face-up almost immediately and travels face-up the rest of
      // the way. Independent of the deal-flip and auto-flip durations.
      this.appendCardFlip(tl, entry.cardObject, startTime, true, drawCfg.flipHalfDuration);
    }

    // Any pre-existing waste cards that the new arrivals push out of
    // the fan window shift to their new (flush) positions in parallel
    // — same helper the placement/undo paths use. The drawn cards
    // themselves are excluded so their primary slide tween isn't
    // doubled.
    const excludeIds = new Set(drawnCardIds);
    this.appendWasteFanShifts(tl, 0, drawCfg.duration, drawCfg.ease, excludeIds);

    this._drawTimeline = tl;
  }

  public playRecycleAnimation(recycledCardIds: readonly number[], onComplete: () => void): void {
    if (recycledCardIds.length === 0) {
      this._refresh();
      onComplete();
      return;
    }
    // Reuses the stock-draw timing — same slide feel, just reversed
    // direction (waste → stock) and flipping face-down instead of
    // face-up.
    const drawCfg = this._config.animation.draw;
    this._recycleTimeline?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this._recycleTimeline = null;
        this._refresh();
        onComplete();
      },
    });

    for (const cardId of recycledCardIds) {
      const entry = this._cardLookup.get(cardId);
      if (!entry) continue;
      const target = this.findCardWorldPosition(cardId);
      if (!target) continue;
      // Same depth-fix as playDrawAnimation: instant-lift to
      // DRAG_LIFT_Y so the card stays above stock and waste meshes
      // throughout the slide. Y is invisible under top-down ortho;
      // the post-animation refresh restores the resting Y.
      entry.cardObject.position.y = DRAG_LIFT_Y;
      tl.to(
        entry.cardObject.position,
        {
          x: target.x,
          z: target.z,
          duration: drawCfg.duration,
          ease: drawCfg.ease,
        },
        0,
      );
      // Face-down flip — opposite direction from the draw, same
      // squish/expand timing.
      this.appendCardFlip(tl, entry.cardObject, 0, false, drawCfg.flipHalfDuration);
    }

    // When called for draw-undo (waste still has cards), the top
    // drawCount of the new model are cards that were previously
    // collapsed under the just-drawn batch. Slide them from base to
    // their new fan offsets in parallel with the drawn cards leaving —
    // mirrors the appendWasteFanShifts call in playDrawAnimation. For
    // forward recycle the waste is empty post-mutation, so the helper
    // iterates 0 cards and is a no-op.
    const excludeIds = new Set(recycledCardIds);
    this.appendWasteFanShifts(tl, 0, drawCfg.duration, drawCfg.ease, excludeIds);

    this._recycleTimeline = tl;
  }

  public playRecycleUndoAnimation(cardIds: readonly number[], onComplete: () => void): void {
    if (cardIds.length === 0) {
      this._refresh();
      onComplete();
      return;
    }
    // Recycle is one atomic action — its undo plays out in two
    // sequential phases:
    //  1. Every card flies as a single stacked column from stock to
    //     the base of the waste, with a face-up flip concurrent with
    //     the slide.
    //  2. Once the column has settled at the base, the top drawCount
    //     cards spread out into their model fan offsets.
    //
    // Phase 1 lifts each card to DRAG_LIFT_Y plus a per-card
    // increment keyed on its POST-UNDO waste index, so the column
    // has deterministic, distinct Y values throughout — top-of-waste
    // sits at the top of the moving stack. Without this stagger,
    // every flying card lands on the same Y and the GPU depth-test
    // ties between coplanar cards (all converging to the same base
    // XZ) flicker frame-to-frame, reading as a wrong-card flash.
    const drawCfg = this._config.animation.draw;
    const waste = this._board.waste;
    const wasteX = waste.worldX;
    const wasteZ = waste.worldZ;

    this._recycleTimeline?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this._recycleTimeline = null;
        this._refresh();
        onComplete();
      },
    });

    const wasteIndexById = new Map<number, number>();
    for (let i = 0; i < waste.cards.length; i++) {
      wasteIndexById.set(waste.cards[i].id, i);
    }

    for (const cardId of cardIds) {
      const entry = this._cardLookup.get(cardId);
      if (!entry) continue;
      const wasteIndex = wasteIndexById.get(cardId);
      if (wasteIndex === undefined) continue;
      // Stagger Y by post-undo stack order so the moving column
      // depth-renders cleanly. The cards' backs are visually identical,
      // so the synchronous reorder relative to the prior stock order
      // is invisible.
      entry.cardObject.position.y = DRAG_LIFT_Y + CARD_STACK_LIFT_Y * wasteIndex;
      tl.to(
        entry.cardObject.position,
        {
          x: wasteX,
          z: wasteZ,
          duration: drawCfg.duration,
          ease: drawCfg.ease,
        },
        0,
      );
      this.appendCardFlip(tl, entry.cardObject, 0, true, drawCfg.flipHalfDuration);
    }

    // Phase 2 — sequential: after every card has landed at the base,
    // the top drawCount cards slide horizontally into their fan
    // offsets. Y stays at the lifted (and now distinct) values so the
    // depth ordering carries cleanly through the spread; refresh
    // restores model Y when the timeline completes.
    const phase2Start = drawCfg.duration;
    for (let i = 0; i < waste.cards.length; i++) {
      const offset = waste.getCardOffset(i);
      if (offset.x === 0) continue;
      const entry = this._cardLookup.get(waste.cards[i].id);
      if (!entry) continue;
      tl.to(
        entry.cardObject.position,
        {
          x: wasteX + offset.x,
          duration: drawCfg.duration,
          ease: drawCfg.ease,
        },
        phase2Start,
      );
    }

    this._recycleTimeline = tl;
  }

  /** Resting world position for `cardId` based on the current model
   *  (pile + index in pile + per-pile fan offset). Returns null if
   *  the card isn't in any pile; callers fall back to a plain refresh. */
  public findCardWorldPosition(cardId: number): { readonly x: number; readonly y: number; readonly z: number } | null {
    for (const pile of this._board.allPiles) {
      for (let i = 0; i < pile.cards.length; i++) {
        if (pile.cards[i].id !== cardId) continue;
        const offset = pile.getCardOffset(i);
        return {
          x: pile.worldX + offset.x,
          y: CARD_STACK_LIFT_Y * (i + 1),
          z: pile.worldZ + offset.z,
        };
      }
    }
    return null;
  }

  private playAutoFlipThenRefresh(autoFlippedCardId: number | null): void {
    if (autoFlippedCardId === null) {
      this._refresh();
      return;
    }
    const entry = this._cardLookup.get(autoFlippedCardId);
    if (!entry) {
      this._refresh();
      return;
    }
    const autoFlipCfg = this._config.animation.autoFlip;
    this._flipTimeline?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this._flipTimeline = null;
        this._refresh();
      },
    });
    this.appendCardFlip(tl, entry.cardObject, 0, true, autoFlipCfg.halfDuration);
    this._flipTimeline = tl;
  }

  private appendCardFlip(
    tl: gsap.core.Timeline,
    cardObject: CardObject,
    startTime: number,
    targetFaceUp: boolean,
    halfDuration: number,
  ): void {
    const flipCfg = this._config.animation.flip;
    // Squish-and-swap flip: scale.x → 0 (card edge-on), swap visible
    // face, scale.x → 1. With the meshes rotated −π/2 around X, local
    // X corresponds to world X, so this collapses the card into a
    // vertical line and back. `targetFaceUp` is the face state the
    // card ends in — true for an auto-flip reveal, false for the
    // un-flip half of an undo.
    tl.to(cardObject.scale, { x: 0, duration: halfDuration, ease: flipCfg.squishEase }, startTime);
    tl.call(() => cardObject.setFaceUp(targetFaceUp), undefined, startTime + halfDuration);
    tl.to(cardObject.scale, { x: 1, duration: halfDuration, ease: flipCfg.expandEase }, startTime + halfDuration);
  }

  /**
   * Queue parallel tweens on `tl` for every waste card whose current
   * rendered position no longer matches its model-resolved fan offset.
   * Lets the placement / undo animations shift the remaining fan cards
   * in step with the primary move tween, so as the top of the waste
   * fan leaves (or returns), the visible fan stays at three cards.
   *
   * `excludeCardIds` skips cards already being animated by the
   * primary tween — used by undo, where the returning card's own
   * tween would otherwise collide with a shift tween for the same
   * cardObject.
   */
  private appendWasteFanShifts(
    tl: gsap.core.Timeline,
    startTime: number,
    duration: number,
    ease: string,
    excludeCardIds?: ReadonlySet<number>,
  ): void {
    const waste = this._board.waste;
    for (let i = 0; i < waste.cards.length; i++) {
      const card = waste.cards[i];
      if (excludeCardIds?.has(card.id)) continue;
      const entry = this._cardLookup.get(card.id);
      if (!entry) continue;
      if (entry.cardObject.parent !== this._cardsRoot) continue;
      const offset = waste.getCardOffset(i);
      const targetX = waste.worldX + offset.x;
      const targetZ = waste.worldZ + offset.z;
      const dx = Math.abs(entry.cardObject.position.x - targetX);
      const dz = Math.abs(entry.cardObject.position.z - targetZ);
      if (dx < 1e-4 && dz < 1e-4) continue;
      tl.to(entry.cardObject.position, { x: targetX, z: targetZ, duration, ease }, startTime);
    }
  }
}
