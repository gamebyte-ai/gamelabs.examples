import { SCREEN_TRANSITION_TYPES, type ScreenTransition, type ViewportConfig } from "@gamebyte/gamelabsjs";

/**
 * Application-level configuration bucket — title, colors, sizes and timings
 * expected to change as the game is built out. Step-by-step gameplay tuning
 * lands here.
 */
export class BrickBreakerConfig {
  /** Game title shown on the boot screen. */
  public readonly title = "Brick Breaker";
  /** Prompt under the title before the game begins. */
  public readonly tagline = "Başlamak için dokun";

  /** Letterbox / pillarbox for the whole render surface — same as Triple Match 3D.
   * The viewport fills the screen within [minAspect, maxAspect]; beyond maxAspect
   * (wider, e.g. landscape) it pillarboxes to black bars, keeping the portrait
   * playfield centered + undistorted. */
  public readonly viewport: ViewportConfig = {
    fit: "contain",
    minAspect: 9 / 23, // tallest/narrowest portrait phones fill (no bars)
    maxAspect: 3 / 4, // wider than this → black bars (landscape pillarboxes)
    background: "#000000",
  };

  /** Vertical background gradient behind the grid: `top` colour → `bottom` colour. */
  public readonly background: {
    top: number;
    bottom: number;
  } = {
    top: 0x5db8ff,
    bottom: 0x0a1f4d,
  };

  /** The play-area BOARD (SP_Game_Board_01) drawn behind the bricks, sized to the
   * visible play area. The gradient still fills the screen outside it. */
  public readonly board: {
    enabled: boolean;
    /** Size multiplier over the play area (1 = exactly the visible cols × rows). */
    scale: number;
  } = {
    enabled: true,
    scale: 1,
  };

  /** Screen enter transitions (per HUD screen id). */
  public readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0,
    },
  };

  /**
   * The brick GRID. `cols × rows` square blocks stacked from the bottom up
   * (row 0 = bottom). The camera frames all `cols` columns across the width and
   * roughly `visibleRows` rows of the BOTTOM of the grid; the rows above scroll
   * into view as the grid descends one step per tap. Level-based block content
   * comes later — for now every cell is filled.
   */
  public readonly grid: {
    /** Columns (X) — all always visible across the width. */
    cols: number;
    /** Total rows (Y) in the grid, only the bottom band is on-screen. */
    rows: number;
    /** Only the bottom `visibleRows` rows are EVER shown — everything above is
     * clipped (hidden), so a narrow screen can't reveal upper rows. */
    visibleRows: number;
    /** Raise/lower the whole grid on Y (world units) — shift the playfield up so
     * there's room below (paddle/ball) without changing the visible-rows clip. */
    yOffset: number;
    /** Rows are filled from THIS row index UP (row 0 = bottom). Everything below is
     * empty at start, so the blocks begin near the top + descend into view. 7 = the
     * 8th row from the bottom is the lowest filled row. */
    fillFromRow: number;
    /** Block square size + gap between blocks (world units). */
    cellSize: number;
    gap: number;
    /** Block SPRITE size as a fraction of `cellSize`, independent of the cell
     * border/lattice. 1 = fills the cell; <1 shrinks the neon square, >1 lets it
     * spill past the cell (the glow can overlap neighbours). */
    blockScale: number;
    /** Draw the white frame around every cell. When false, cells/blocks fill the
     * full `cellSize` (only `gap` separates them) and no border shows. */
    showCellBorder: boolean;
    /** White cell frame thickness (world units) — drawn around every cell. */
    borderWidth: number;
    borderColor: number;
    /** Inner colour of an EMPTY cell (shows through the frame so the grid lattice
     * is visible even where there's no block). */
    emptyColor: number;
    /** Block fill colours, cycled by row (placeholder — level art comes later). */
    colors: number[];
  } = {
    cols: 7,
    rows: 20,
    visibleRows: 9,
    yOffset: 8.4,
    fillFromRow: 7,
    cellSize: 1.8,
    gap: 0.01,
    blockScale: 1.2,
    showCellBorder: false,
    borderWidth: 0.9,
    borderColor: 0xffffff,
    emptyColor: 0x0e1730,
    colors: [0xff5a5f, 0xffb020, 0xffe14d, 0x50c878, 0x2ec4c4, 0x4a90e2, 0xa66bff],
  };

  /**
   * Orthographic camera framing the grid. The vertical framing is FIXED: the
   * frustum height is frozen at `refAspect` (the narrowest screen we design for)
   * and stays constant for every wider screen — so widening the window NEVER
   * shifts or zooms the grid vertically, it only adds gradient room on the sides.
   * The camera is BOTTOM-anchored (row 0 sits `bottomMargin` above the bottom
   * edge) and fits all `grid.cols` columns across the width (+ `sideMargin`).
   */
  public readonly camera: {
    /** Distance in front of the grid (z); ortho, so it only affects clipping. */
    z: number;
    /** Gap below row 0's bottom edge to the frustum bottom (world units). */
    bottomMargin: number;
    /** Gap above the top visible row to the frustum top (world units). */
    topMargin: number;
    /** Margin outside the outer columns so they never touch the edge (world units). */
    sideMargin: number;
    /**
     * Narrowest aspect (width / height) we design for. The frustum height is
     * computed once here — enough to fit all `cols` across the width AND show the
     * bottom `visibleRows` — then FROZEN for every screen at least this wide, so
     * the grid keeps the exact same size/position as the screen widens. Screens
     * narrower than this (rare — the viewport clamps at minAspect) zoom out to
     * keep the columns fitting. Set this to the narrowest screen you tune on.
     */
    refAspect: number;
  } = {
    z: 20,
    bottomMargin: 0.5,
    topMargin: 0.5,
    sideMargin: 0.35,
    refAspect: 0.45,
  };

  /**
   * Static frame drawn around the VISIBLE play area (the bottom `visibleRows` ×
   * `cols` band). It's fixed — the descending blocks scroll behind it — and marks
   * the boundary where blocks are clipped.
   */
  public readonly outline: {
    /** Draw the frame at all. */
    enabled: boolean;
    /** Frame colour. */
    color: number;
    /** Frame bar thickness (world units). */
    thickness: number;
    /** Gap between the outer cells and the inner edge of the frame (world units). */
    padding: number;
  } = {
    enabled: false,
    color: 0xffffff,
    thickness: 0.18,
    padding: 0.12,
  };

  /**
   * The SHOOTER at the base of the play area. For now just a circle; dragging
   * (mouse or touch) sets its aim angle. An optional aim line visualises the
   * current angle. A plain tap (no drag) still steps the grid down.
   */
  public readonly shooter: {
    /** Draw the shooter at all. */
    enabled: boolean;
    /** Circle colour. */
    color: number;
    /** Circle radius (world units). */
    radius: number;
    /** Shooter centre height ABOVE the play-area bottom edge (world units), so it
     * always sits just inside the base of the play area regardless of `yOffset`. */
    yFromBase: number;
    /** Minimum firing angle ABOVE horizontal, in degrees. The aim is clamped to
     * [minAngleDeg, 180 − minAngleDeg], so a shot can never be flatter than this
     * on either side (0 = would allow horizontal, 90 = only straight up). */
    minAngleDeg: number;
    /** Initial aim angle, degrees from +X (90 = straight up). */
    startAngleDeg: number;
    /** Seconds for the shooter to slide to the first-landed ball's X after a shot. */
    moveSeconds: number;
    /** Guide line showing the aim direction. */
    aimLine: {
      enabled: boolean;
      color: number;
      /** Line thickness (world units). */
      width: number;
      /** Line length from the shooter centre outward (world units). */
      length: number;
    };
    /** The "×N" ball-count label near the shooter. */
    count: {
      /** Label height in world units (its font size); width tracks the 2:1 texture. */
      size: number;
      /** Vertical offset from the shooter centre (world units; negative = below). */
      yOffset: number;
    };
    /** The ammo ball resting inside the shooter: its position offset + size. */
    loadedBall: {
      /** Offset from the shooter centre (world units). */
      offsetX: number;
      offsetY: number;
      /** Diameter as a fraction of the ball's own size (1 = same as a fired ball). */
      scale: number;
    };
  } = {
    enabled: true,
    color: 0xffffff,
    radius: 0.51,
    yFromBase: 0.53,
    minAngleDeg: 20,
    startAngleDeg: 90,
    moveSeconds: 0.3,
    aimLine: {
      enabled: true,
      color: 0xffffff,
      width: 0.12,
      length: 4,
    },
    count: {
      size: 1.7,
      yOffset: -2,
    },
    loadedBall: {
      offsetX: 0,
      offsetY: -0.05,
      scale: 1.4,
    },
  };

  /**
   * Top-of-screen HUD: the **Time** and **Score** readouts, side by side. Each is
   * a rounded pill (SP_UI_BG_01) with its label sprite above it and a value text
   * inside. VISUAL ONLY for now — the timer/score mechanics land later, so the
   * values are static placeholders. Positions are fractions of the HUD size so
   * the bar tracks the top of the portrait play surface.
   */
  public readonly hud: {
    /** Placeholder readouts until the mechanics are wired. */
    time: string;
    score: string;
    /** Vertical position of the label row top (fraction of HUD WIDTH — the whole
     * HUD keys off width so its proportions never change with the screen aspect). */
    topFraction: number;
    /** Each pill's width as a fraction of the HUD width. */
    pillWidthFraction: number;
    /** Horizontal gap between the two pills (fraction of HUD width). */
    gapFraction: number;
    /** Gap between a label and its pill (fraction of HUD WIDTH). */
    labelGapFraction: number;
    /** Label (Time/Score) HEIGHT as a fraction of the pill height. Both labels use
     * the same height so their font sizes match and the pills stay aligned. */
    labelHeightFraction: number;
    /** Value text colour + size (fraction of the pill height). */
    valueColor: number;
    valueFontFraction: number;
    /** FIXED reference width (px) the HUD sizes itself against — so its scale does
     * NOT change with the screen size (only its horizontal centre tracks the view).
     * All the fractions above are of THIS, not the live viewport. */
    referenceWidth: number;
  } = {
    time: "2:25",
    score: "0",
    topFraction: 0.045,
    pillWidthFraction: 0.14,
    gapFraction: 0.044,
    labelGapFraction: 0.006,
    labelHeightFraction: 0.6,
    valueColor: 0xffffff,
    valueFontFraction: 0.5,
    referenceWidth: 720,
  };

  /** The round countdown: the Time pill counts down from `durationSeconds`; at 0
   * the game ends and `gameOverText` is shown. */
  public readonly time: {
    /** Countdown length (seconds). */
    durationSeconds: number;
    /** Start counting down immediately on load. */
    autoStart: boolean;
    /** Banner shown when the timer hits 0. */
    gameOverText: string;
  } = {
    durationSeconds: 120,
    autoStart: true,
    gameOverText: "Oyun Bitti",
  };

  /**
   * The BALLS fired by the shooter. A tap fires `count` balls (which grows by 1
   * each shot) one-by-one in the aim direction; they bounce off the walls + bricks
   * and are collected back at the shooter. Once ALL are back, the grid descends one
   * step and the next shot fires one more ball.
   */
  public readonly ball: {
    /** Ball radius (world units). */
    radius: number;
    /** Travel speed (world units / second). */
    speed: number;
    /** Speed a landed ball slides along the floor back to the shooter (world/sec). */
    returnSpeed: number;
    /** How many balls the FIRST shot fires; +1 per shot thereafter. */
    startCount: number;
    /** Delay between consecutive balls of a single shot (seconds). */
    shootInterval: number;
  } = {
    radius: 0.65,
    speed: 30,
    returnSpeed: 14,
    startCount: 10,
    shootInterval: 0.08,
  };

  /** Brick behaviour. */
  public readonly brick: {
    /** Hits a brick takes before it's destroyed (ball bounces off it each hit). */
    hp: number;
    /** Break animation played when a brick is destroyed (scale-up + fade-out). The
     * brick stops colliding immediately and its HP number vanishes at once. */
    break: {
      seconds: number;
      /** Final scale multiplier during the break. */
      scaleUp: number;
    };
  } = {
    hp: 1,
    break: {
      seconds: 0.25,
      scaleUp: 1.4,
    },
  };

  /**
   * Ball WALL colliders. By default the left/right/top walls sit on the VISIBLE
   * outline's inner surface (so a ball's edge bounces right on the frame) and the
   * floor on the shooter line. These per-side offsets (world units) nudge each
   * collider: positive `*Inset` moves that wall INWARD (shrinks the play area),
   * negative pushes it OUTWARD; positive `floorOffset` raises the collection line.
   */
  public readonly walls: {
    leftInset: number;
    rightInset: number;
    topInset: number;
    floorOffset: number;
  } = {
    leftInset: -0.25,
    rightInset:-0.25,
    topInset: -0.25,
    floorOffset: -0.25,
  };

  /**
   * LEVEL layout. `current` (1-based) picks a column mask from `columnMasks`: for
   * every spawned row, a `false` entry leaves that column empty. A mask must be
   * `grid.cols` long, otherwise the row is filled solid. Level 1 = full rows;
   * Level 2 = the outer columns (left + right) stay empty.
   */
  public readonly level: {
    current: number;
    columnMasks: boolean[][];
  } = {
    current: 2,
    columnMasks: [
      // Level 1 — solid rows.
      [true, true, true, true, true, true, true],
      // Level 2 — empty left + right columns.
      [false, true, true, true, true, true, false],
    ],
  };

  /** How long the one-step descend animation takes (seconds). */
  public readonly descend: {
    seconds: number;
  } = {
    seconds: 0.22,
  };
}
