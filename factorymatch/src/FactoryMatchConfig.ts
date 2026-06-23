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

  /** Static bin the shapes pile up in. */
  public readonly bin = {
    innerHalf: 1.4, // play area half-extent in x and z
    floorY: 0, // top surface of the floor
    floorColor: 0x2b313b,
    wallHeight: 1.0, // visible glass-wall height
    wallColliderHeight: 5.0, // collider extends higher than the glass so shapes can't bounce out
    wallThickness: 0.16,
    wallColor: 0x3b4250,
  };

  /** 3D slot rack in front of the bin where collected shapes fly to and line up.
   * `itemScale` is the collected shape's size relative to its pile size.
   * `itemRotationY` (degrees) gives the seated shape a slight diagonal turn.
   * `tiltX` (degrees) is the shared X-tilt (pitch toward the camera) applied to
   * BOTH the pads and the seated items, so an item always sits flush on its pad. */
  public readonly rack = {
    z: 2.35,
    y: 0.32,
    spacing: 0.76,
    itemScale: 0.42,
    itemRotationY: 25,
    tiltX: -40,
    itemLift: 0.15, // raises the seated item so its base rests on the pad (anchor is its center, not its base)
    arcLift: 1.5, // collected item hops this high (world units) above its start/end before landing in the tray
    shiftHop: 1.8, // how high a seated item hops while sliding to a new slot on reorder (world units)
    suspensionDip: 0.5, // how far the pad + landed item sink on impact before springing back (world units)
    matchLift: 1.8, // how high a matched shape rises off the rack before collapsing (world units)
    matchGrow: 1.5, // peak scale of a matched shape during the rise, as a multiple of itemScale
    padWidth: 0.62, // pad size in x (world units) — keep ≤ spacing to avoid neighbours touching
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

  /** 3D model display sizing. Each model is uniformly scaled so its largest
   * extent equals `fit` × its per-kind `scale` (world units). `fit` sets the
   * shared baseline; bump a single `scale` entry to make just that model bigger
   * or smaller. Visual only — does not change the collider. */
  public readonly models: { fit: number; scale: Record<Kind, number> } = {
    fit: 0.55,
    scale: { dice: 1, billardball: 1, guitar: 1, radio: 1, gascan: 1 },
  };

  /** How many of each kind to drop into the bin (multiples of matchCount → fully clearable). */
  public readonly spawnPerKind = 6;
  /** Horizontal jitter + vertical stagger for the initial drop. */
  public readonly spawn = { areaHalf: 1.0, baseY: 1.3, stepY: 0.5 };

  /** Slot tray: collect identical shapes; matchCount of a kind clears + scores. */
  public readonly slots = { capacity: 7, matchCount: 3, matchPoints: 10 };

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
