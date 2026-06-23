import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";
import type { Kind } from "./models/IGameModel.js";

/** Per-kind (box) collider full-extents + a tint colour applied to kinds that
 * have no albedo texture yet (textured kinds ignore it). Colliders are box
 * approximations — the distinct models give the gameplay-relevant difference. */
export interface KindDef {
  color: number;
  collider: { width: number; height: number; depth: number };
}

/** All tuning for the 3D physics scene + the slot/match rules. Units are meters (world space). */
export class FactoryMatchConfig {
  public readonly title = "Factory Match";

  /** Solid clear colour behind the 3D scene (the game background). */
  public readonly background = 0x3a485b;

  /** Static bin the shapes pile up in. `transparent` hides the floor + glass
   * walls so the pile floats on the background (the colliders are unaffected). */
  public readonly bin = {
    halfWidth: 1.4, // play-area half-extent in x (pool width = halfWidth * 2)
    halfDepth: 1.4, // play-area half-extent in z (pool depth = halfDepth * 2)
    floorY: 0, // top surface of the floor
    floorColor: 0x2b313b,
    wallHeight: 1.0, // visible glass-wall height
    wallColliderHeight: 5.0, // collider extends higher than the glass so shapes can't bounce out
    wallThickness: 0.16,
    wallColor: 0x3b4250,
    transparent: true, // skip the bin's visual mesh (colliders stay) — pile sits on the background
  };

  /** 3D slot rack in front of the bin where collected shapes fly to and line up.
   * `itemScale` is the collected shape's size relative to its pile size.
   * `itemRotationY` (degrees) gives the seated shape a slight diagonal turn.
   * `tiltX` (degrees) is the shared X-tilt (pitch toward the camera) applied to
   * BOTH the pads and the seated items, so an item always sits flush on its pad. */
  public readonly rack = {
    z: 2.35,
    y: 0.32,
    itemScale: 0.6,
    itemRotationY: 25,
    tiltX: -40,
    itemLift: 0.15, // raises the seated item so its base rests on the pad (anchor is its center, not its base)
    arcLift: 1.5, // collected item hops this high (world units) above its start/end before landing in the tray
    shiftHop: 1.8, // how high a seated item hops while sliding to a new slot on reorder (world units)
    suspensionDip: 0.5, // how far the pad + landed item sink on impact before springing back (world units)
    matchLift: 1.8, // how high a matched shape rises off the rack before collapsing (world units)
    matchGrow: 1.5, // peak scale of a matched shape during the rise, as a multiple of itemScale
    // Tray sizing (world units). Slot pitch = padWidth + gap; the full row spans
    // (capacity-1)*(padWidth+gap) + padWidth, which must fit the portrait width
    // (ortho width ≈ frustumHeight * viewport-aspect, ~3.3–4.0 in portrait).
    padWidth: 0.39, // block width in x
    gap: 0.06, // empty space between adjacent blocks
    padDepth: 0.4, // pad size in z (world units)
    padColor: 0x222831,
  };

  /** Animation durations (seconds). `matchRise`/`matchCollapse` are the two
   * phases of a clear: rise+grow, then converge on the group centre while
   * shrinking to nothing. */ 
  public readonly anim = {
    fly: 0.45,
    slide: 0.3,
    trayDrop: 0.25, // how long the tray's fall takes — AND, symmetrically, its rise back (seconds); both block + tray reach the lowest point at the same instant. SMALLER = tray starts later and falls faster; LARGER = starts earlier and falls slower (if it exceeds `fly`, the whole flight stretches to match).
    matchRise: 0.2,
    matchCollapse: 0.2,
    shiftStagger: 0.05, // delay between consecutive items' reorder hops (seconds) — 0 = all hop together
  };

  public readonly kinds: Record<Kind, KindDef> = {
    dice: { color: 0xf5f5f5, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
    billardball: { color: 0x1a1a1a, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
    guitar: { color: 0xebc26a, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
    radio: { color: 0x2bb1a8, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
    gascan: { color: 0xd23b2e, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
  };

  /** Per-kind display tuning. `size` = largest world-space extent each model is
   * uniformly scaled to (independent per kind). `rotation` = a base orientation
   * fix (degrees) baked into the model so it sits upright/forward on the tray;
   * the rack tilt is applied on top of this. Visual only — not the collider. */
  public readonly models: {
    size: Record<Kind, number>;
    rotation: Record<Kind, { x: number; y: number; z: number }>;
  } = {
    size: { dice: 0.35, billardball: 0.4, guitar: 1, radio: 0.6, gascan: 0.6 },
    rotation: {
      dice: { x: 0, y: 0, z: 0 },
      billardball: { x: 0, y: 0, z: 0 },
      guitar: { x: -90, y: 0, z: 180 },
      radio: { x: 90, y: 180, z: 0 },
      gascan: { x: 90  , y:  180, z: 20 },
    },
  };

  /** How many of each kind to drop into the bin, per kind (keep each a multiple of
   * matchCount → fully clearable). */
  public readonly spawnPerKind: Record<Kind, number> = {
    dice: 12,
    billardball: 12,
    guitar: 12,
    radio: 12,
    gascan: 12,
  };
  /** Initial drop placement. `baseY` is the lowest spawn height; each successive
   * item is staggered `stepY` higher (so they don't spawn inside each other), and
   * `areaHalf` is the x/z jitter. Drop height grows with item count — the topmost
   * item starts at baseY + (count-1) * stepY, so lower stepY/baseY to drop lower. */
  public readonly spawn = { areaHalf: 1.0, baseY: 1.3, stepY: 0.45 };

  /** World physics (applied to ALL contacts via the engine's default contact
   * material, so it governs item↔item piling, not just item↔floor). `gravity` is
   * the y acceleration (m/s², more negative = faster fall) for the opening drop;
   * `gravityAfterStart` replaces it once play begins (applied as a per-body
   * correction force, since the world gravity is fixed at creation);
   * `restitution` is the bounce [0,1]; `friction` resists sliding. */
  public readonly physics = {
    gravity: -10.82,
    gravityAfterStart: -7.82,
    restitution: 0,
    friction: 1,
    // The pile is simulated only in short bursts, then frozen, so idle items
    // don't jitter forever. `settleSeconds` is the physics-on window after each
    // pick; `initialSettleSeconds` is the longer window after a (re)build so the
    // first drop has time to come to rest before freezing.
    settleSeconds:0.5,
    initialSettleSeconds:4,
  };

  /** Start-of-game intro: a 3-2-1 countdown (using the number assets) then "Go!".
   * Play is blocked + the clock is paused until it finishes. `stepSeconds` is how
   * long each beat is shown; `numberH`/`goH` are on-screen heights; `peakScale` is
   * the pop's overshoot; `goText` is the placeholder until the Go art lands. */
  public readonly countdown = {
    stepSeconds:1.2,
    numberH: 180,
    goH: 200,
    peakScale: 0.7,
    goText: "GO!",
  };

  /** Slot tray: collect identical shapes; matchCount of a kind clears + scores. */
  public readonly slots = { capacity: 7, matchCount: 3, matchPoints: 10 };

  /** Countdown clock shown top-centre. `startSeconds` is the time the player has;
   * when it reaches zero the game is lost. Displayed as mm:ss. */
  public readonly time = { startSeconds: 120 };

  /** HUD goal chips (3, shown below the timer). `kind` picks the model shown,
   * `target` is the displayed count. Placeholder wiring — goal art + completion
   * rules come later; for now they render their bg + count text. */
  public readonly goals: { kind: Kind; target: number }[] = [
    { kind: "dice", target: 15 },
    { kind: "radio", target: 14 },
    { kind: "billardball", target: 15 },
  ];

  /** HUD layout (screen pixels). `topY` is the timer + score row centre; `goalsY`
   * is the goal chips' row centre (both from the top of the screen). `goalFontSize`
   * sizes the goal count text; `goalTextY` offsets that text from the chip centre
   * (positive = down). `goalIconH` is the goal item icon's on-screen height;
   * `goalIconY` offsets it from the chip centre (negative = up). */
  public readonly hud = {
    topY: 62,
    goalsY: 142,
    goalFontSize: 15,
    goalTextY: 24,
    goalIconH: 46,
    goalIconY: -14,
    goalPulseScale: 1.2, // peak scale of a goal chip's pop when its count ticks down
    goalPulseDuration: 0.14, // half-duration of the pop (up, then back) (seconds)
  };

  /** Fixed 3D camera looking down into the bin.
   * `orthographic` swaps the perspective camera for an isometric-style parallel
   * projection (no perspective convergence). `frustumHeight` is the vertical
   * world-space extent the camera shows — smaller = more zoomed in. Width is
   * derived from the viewport aspect, so portrait framing stays consistent. */
  public readonly camera = {
    position: { x: 0, y: 6.6, z: 1.4 },
    lookAt: { x: 0, y: 0.35, z: 0.2 },
    orthographic: true,
    frustumHeight: 7.2,
  };

  /** Selection silhouette shown while a pile shape is hovered (mouse) or pressed
   * (touch). Rendered as an inverted hull: a back-faces-only copy enlarged by
   * `scale`, so only the outer screen contour shows. `scale` sets rim thickness
   * (1.04 = 4% larger than the shape). */
  public readonly outline = { color: 0xffea00, scale: 1.08 };

  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 },
  };
}
