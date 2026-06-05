import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * All tuning for the single Castle Crushers level lives here. Coordinates are
 * in a fixed 1280x720 "design space" (pixels, y-down) that the view scales to
 * fit the viewport — so physics positions stay stable across screen sizes.
 */
export class CastleCrushersConfig {
  public readonly title = "Castle Crushers";

  /** Fixed design resolution the physics world and graphics share. */
  public readonly design = { width: 1280, height: 720 };

  /** Top surface of the full-width ground. */
  public readonly groundTopY = 660;

  /** Raised pedestal the castle is stacked on (static). */
  public readonly pedestal = {
    centerX: 940,
    topY: 560,
    width: 320,
    height: 100,
  };

  /** Castle: a grid of stacked dynamic blocks sitting on the pedestal. */
  public readonly castle = {
    blockWidth: 64,
    blockHeight: 64,
    columns: 3,
    rows: 3,
    gap: 4,
    /** Density tweaks how heavy/topple-prone blocks feel. */
    blockDensity: 0.0014,
    blockFriction: 0.5,
    blockRestitution: 0.05,
  };

  /** The golden crown block that sits on top — knock it off to win. */
  public readonly crown = {
    size: 56,
    density: 0.0016,
  };

  /** Projectiles the player launches from the left. */
  public readonly ammo = {
    count: 4,
    radius: 20,
    density: 0.004,
    restitution: 0.25,
    /** Launch pad position. */
    originX: 150,
    originY: 560,
    /** Drag vector → launch velocity multiplier, and the speed cap. */
    speedScale: 0.16,
    maxSpeed: 32,
  };

  /**
   * Win when the crown's center drops below this line (it fell off the
   * pedestal toward the ground). Pedestal top is 560, so this is well below
   * where the crown rests when the castle is intact.
   */
  public readonly winLineY = 620;

  /** Below this speed every dynamic body is considered "settled" (for lose detection). */
  public readonly settleSpeed = 0.25;

  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 },
  };
}
