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
    innerHalf: 1.4, // play area half-extent in x and z
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
    padWidth: 0.42, // block width in x
    gap: 0.06, // empty space between adjacent blocks
    padDepth: 0.34, // pad size in z (world units)
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
  };

  public readonly kinds: Record<Kind, KindDef> = {
    dice: { color: 0xf5f5f5, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
    billardball: { color: 0x1a1a1a, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
    guitar: { color: 0x8a5a2b, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
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
      guitar: { x: -90, y: 0, z: 0 },
      radio: { x: 180, y: 0, z: 0 },
      gascan: { x: 0, y: 0, z: 0 },
    },
  };

  /** How many of each kind to drop into the bin (multiples of matchCount → fully clearable). */
  public readonly spawnPerKind = 12;
  /** Horizontal jitter + vertical stagger for the initial drop. */
  public readonly spawn = { areaHalf: 1.0, baseY: 1.3, stepY: 0.5 };

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
  public readonly outline = { color: 0xffffff, scale: 1.04 };

  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 },
  };
}
