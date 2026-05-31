import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";
import { SlotType } from "./constants/SlotType";
import type { SlotPalette } from "./views/SlotObject";
import type { CardVisualConfig } from "./views/CardObject";

export interface DragReleaseAnimationConfig {
  readonly duration: number;
  readonly ease: string;
}

export interface QuickPlacementAnimationConfig {
  readonly duration: number;
  /** Constant Y the card is lifted to for the duration of the
   *  flight, in world units. Invisible under top-down ortho but
   *  keeps the card above any cards it passes over during travel.
   *  The resting Y is restored by the post-animation refresh. */
  readonly liftY: number;
  readonly ease: string;
}

export interface DealMotionPhaseConfig {
  readonly duration: number;
  readonly ease: string;
}

export interface DealAnimationConfig {
  /** Time between successive cards starting their motion — the
   *  sequence pacing. Fully independent of `exit` and `travel`: if
   *  their sum is less than this value there's a gap between
   *  landings, if greater the next card lifts before the previous
   *  one lands. */
  readonly perCardDuration: number;
  /** First leg of each card's motion. Travels the initial
   *  `exit.duration / (exit.duration + travel.duration)` fraction
   *  of the way to the destination along a direct line — no Y lift
   *  over the stack, so the topmost stock card stays visually in
   *  place during the deal (cards exit by sliding out from under
   *  it, not by rising above). */
  readonly exit: DealMotionPhaseConfig;
  /** Second leg — completes the journey from the exit-end position
   *  to the tableau resting position. */
  readonly travel: DealMotionPhaseConfig;
  /** Half-duration of the face-up flip on the top card of each
   *  tableau column as it lands. Independent of the other flip
   *  contexts (stock-draw flip, auto-flip on reveal) so the deal
   *  can read at its own pace. */
  readonly flipHalfDuration: number;
}

export interface FlipAnimationConfig {
  /** Squish phase ease (face → edge-on). Shared by every flip
   *  context; per-context durations live on the consuming animation
   *  config (`deal.flipHalfDuration`, `draw.flipHalfDuration`,
   *  `autoFlip.halfDuration`). */
  readonly squishEase: string;
  /** Expand phase ease (edge-on → face). Shared by every flip
   *  context. */
  readonly expandEase: string;
}

export interface DrawAnimationConfig {
  /** Per-card duration of the slide from stock to waste. */
  readonly duration: number;
  /** Easing for the slide. The flip itself reuses `flip.squishEase`
   *  / `flip.expandEase`. */
  readonly ease: string;
  /** Delay between successive cards starting in Turn 3. Smaller
   *  than `duration` so the cards overlap in flight (each lifts off
   *  before the previous one lands), reading as a quick sequence. */
  readonly staggerDelay: number;
  /** Half-duration of the face-up flip while a card slides from
   *  stock to waste. Independent of the deal-flip and auto-flip
   *  durations so the snappy draw can stay snappy without speeding
   *  the other flips up. */
  readonly flipHalfDuration: number;
}

export interface AutoFlipAnimationConfig {
  /** Half-duration of the squish/expand flip used when a face-down
   *  tableau card is revealed (auto-flip), and the symmetric un-flip
   *  played by undo. Independent of the deal and draw flip
   *  durations. */
  readonly halfDuration: number;
}

export interface DeniedShakeAnimationConfig {
  /** Total duration of the shake, including the return to origin. */
  readonly duration: number;
  /** Peak X displacement from the card's resting position, world units. */
  readonly amplitude: number;
  readonly ease: string;
}

export interface MovePointsConfig {
  readonly wasteToTableau: number;
  readonly wasteToFoundation: number;
  readonly tableauToFoundation: number;
  readonly tableauToTableau: number;
  readonly foundationToTableau: number;
  readonly foundationToFoundation: number;
}

export interface ScoreConfig {
  /** Per-move point values, keyed by `(origin, target)` pile types.
   *  A move earns a single award per event regardless of how many
   *  cards travel (tableau-to-tableau runs are one event, not one
   *  per card). Combinations that aren't legal during play stay
   *  configurable so undo can still revert any awarded points
   *  deterministically. */
  readonly movePoints: MovePointsConfig;
  /** Awarded once each time an auto-flip reveals a face-down
   *  tableau card. */
  readonly autoFlipReveal: number;
  /** Applied per stock-to-waste draw (0 for standard Klondike,
   *  negative for "pass-through" scoring variants). */
  readonly stockDraw: number;
  /** Applied per waste-to-stock recycle. */
  readonly stockRecycle: number;
  /** Flat penalty applied on each undo. The original action's
   *  awarded points are reverted automatically; this is the extra
   *  cost layered on top to discourage undo-spam. */
  readonly undoPenalty: number;
}

export type TimeDirection = "up" | "down";
export type TimeDisplayFormat = "mm:ss" | "hh:mm:ss" | "ss";

export interface TimeConfig {
  /** Initial display value, in seconds. Count-up adds elapsed time
   *  to this baseline; count-down ticks toward zero from this. */
  readonly startSeconds: number;
  readonly direction: TimeDirection;
  readonly displayFormat: TimeDisplayFormat;
}

export interface AnimationConfig {
  /** Pixels the pointer must travel after pointer-down on a face-up
   *  card before a drag visual is initiated. A pointer-up below this
   *  threshold is interpreted as a click (quick-placement). */
  readonly dragStartThresholdPx: number;
  readonly dragRelease: DragReleaseAnimationConfig;
  readonly quickPlacement: QuickPlacementAnimationConfig;
  readonly deal: DealAnimationConfig;
  readonly flip: FlipAnimationConfig;
  readonly draw: DrawAnimationConfig;
  readonly autoFlip: AutoFlipAnimationConfig;
  readonly deniedShake: DeniedShakeAnimationConfig;
}

export class SolitaireConfig {
  public readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0,
    },
  };

  // Cards drawn from stock to waste per click. Standard Klondike values
  // are 1 (Turn 1) or 3 (Turn 3). A future level / settings screen would
  // write to this single source of truth.
  public readonly drawCount: number = 3;

  // Seed for shuffle. null = non-deterministic (Math.random).
  public readonly shuffleSeed: number | null = 1;

  // Slot rectangle size in world units, shared by every pile.
  public readonly slotWidth: number = 1.0;
  public readonly slotHeight: number = 1.4;

  // Per-card horizontal offset within the waste pile's visible fan.
  // Only applies when drawCount > 1 (Turn 3 mode); the topmost
  // `drawCount` cards fan to the right at this stride so the number
  // of recently drawn cards is visible at a glance.
  public readonly wasteFanX: number = 0.22;

  public readonly slotPalettes: Readonly<Record<SlotType, SlotPalette>> = {
    [SlotType.Stock]: { fill: 0x1a2a4a, outline: 0x4a90e2 },
    [SlotType.Waste]: { fill: 0x2a1f4a, outline: 0xb98ce5 },
    [SlotType.Foundation]: { fill: 0x1a4a2f, outline: 0x4ae28a },
    [SlotType.Tableau]: { fill: 0x4a3a1a, outline: 0xe2b54a },
  };

  // Slightly smaller than a slot so the slot outline is visible behind the card.
  public readonly cardVisual: CardVisualConfig = {
    width: 0.9,
    height: 1.28,
    backColor: 0x1f3a8a,
    faceBackground: 0xf5f5dc,
    redColor: 0xc12424,
    blackColor: 0x111111,
  };

  // Central tuning surface for every animation timing in the example —
  // durations, eases, and the drag-vs-click threshold. The board view
  // reads these directly; spatial layout values (stack lifts, drag
  // elevation, arc apex height) live alongside the view that consumes
  // them since they're scene-structure, not timing.
  public readonly animation: AnimationConfig = {
    dragStartThresholdPx: 5,
    dragRelease: {
      duration: 0.25,
      ease: "power2.out",
    },
    quickPlacement: {
      duration: 0.2,
      liftY: 0.25,
      ease: "power2.out",
    },
    deal: {
      perCardDuration: 0.1,
      // Card accelerates off the stack (starts at rest, gains
      // vertical velocity); travel then decelerates into the
      // tableau slot. Together the overall motion reads as a
      // single smooth accelerate-then-decelerate.
      exit: { duration: 0.16, ease: "power2.in" },
      travel: { duration: 0.44, ease: "power2.out" },
      // Original deal-flip pace; kept independent so the snappy
      // draw flip can stay fast without speeding the deal up too.
      flipHalfDuration: 0.08,
    },
    flip: {
      squishEase: "power1.in",
      expandEase: "power1.out",
    },
    draw: {
      duration: 0.3,
      ease: "power2.out",
      staggerDelay: 0,
      // Snappy flip on the stock-to-waste slide.
      flipHalfDuration: 0.11,
    },
    autoFlip: {
      // Tableau auto-flip on reveal, and the symmetric un-flip
      // played by undo.
      halfDuration: 0.08,
    },
    deniedShake: {
      duration: 0.2,
      amplitude: 0.04,
      ease: "sine.inOut",
    },
  };

  // Score table. Every scoring event in the game reads from here —
  // tweaking a value changes the award everywhere the event fires.
  // Defaults follow standard Klondike scoring (5 for waste→tableau,
  // 10 for foundation placements, -15 for taking back off a foundation,
  // 5 per auto-flip reveal). Undo penalty is example-specific and
  // demonstrates that custom rules slot in as easily as standard ones.
  public readonly score: ScoreConfig = {
    movePoints: {
      wasteToTableau: 5,
      wasteToFoundation: 10,
      tableauToFoundation: 10,
      tableauToTableau: 0,
      foundationToTableau: -15,
      foundationToFoundation: 0,
    },
    autoFlipReveal: 5,
    stockDraw: 0,
    stockRecycle: 0,
    undoPenalty: -2,
  };

  // Time-display tuning. `startSeconds` is the initial display value
  // (a count-up clock starts from this; a count-down clock ticks toward
  // zero from this). `direction` and `displayFormat` are independent —
  // a 3-minute count-down displayed as "mm:ss" reads "03:00" and ticks
  // toward "00:00"; a count-up with `startSeconds: 0` and "mm:ss" reads
  // "00:00" and climbs. When `direction` is "down" the game ends in a
  // lose state the moment the clock hits zero.
  public readonly time: TimeConfig = {
    startSeconds: 180,
    direction: "down",
    displayFormat: "mm:ss",
  };
}
