import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";
import type { Kind } from "./models/IGameModel.js";

/** Per-kind appearance + (box) collider full-extents. Colliders are box
 * approximations — distinct meshes give the gameplay-relevant difference. */
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
   * `itemScale` shrinks a collected shape to a quarter of its pile size. */
  public readonly rack = { z: 2.35, y: 0.32, spacing: 0.46, itemScale: 0.25, padColor: 0x222831 };

  /** Animation durations (seconds). */
  public readonly anim = { fly: 0.45, slide: 0.28, pop: 0.24 };

  public readonly kinds: Record<Kind, KindDef> = {
    cube: { color: 0x49c95a, collider: { width: 0.5, height: 0.5, depth: 0.5 } },
    cylinder: { color: 0xf2c14e, collider: { width: 0.52, height: 0.5, depth: 0.52 } },
    plus: { color: 0x3f8cff, collider: { width: 0.62, height: 0.5, depth: 0.62 } },
    triprism: { color: 0x9b5cf0, collider: { width: 0.56, height: 0.5, depth: 0.56 } },
  };

  /** How many of each kind to drop into the bin (multiples of matchCount → fully clearable). */
  public readonly spawnPerKind = 6;
  /** Horizontal jitter + vertical stagger for the initial drop. */
  public readonly spawn = { areaHalf: 1.0, baseY: 1.3, stepY: 0.5 };

  /** Slot tray: collect identical shapes; matchCount of a kind clears + scores. */
  public readonly slots = { capacity: 7, matchCount: 3, matchPoints: 10 };

  /** Fixed 3D camera looking down into the bin. */
  public readonly camera = {
    position: { x: 0, y: 3.6, z: 4.4 },
    lookAt: { x: 0, y: 0.35, z: 0 },
  };

  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 },
  };
}
