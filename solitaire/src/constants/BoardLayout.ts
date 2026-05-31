/**
 * Spatial layout constants shared by the board view and its animator.
 * Y values are world units along the up axis (invisible under the
 * top-down orthographic camera, but used by the depth buffer to order
 * stacked cards).
 */

/** Per-stack-index Y offset for cards resting in a pile (top card sits
 *  at `CARD_STACK_LIFT_Y * (index + 1)` above the slot mesh). */
export const CARD_STACK_LIFT_Y = 0.001;

/** Constant Y for the drag root and every animation that lifts a card
 *  above the rest of the board for the duration of its flight. */
export const DRAG_LIFT_Y = 0.4;

/** Tiny Y stagger between cards in the drag stack so the bottom card
 *  lands flush at the destination's resting Y while the cards above
 *  still stack in order. */
export const DRAG_CARD_SUBLIFT_Y = 0.01;
