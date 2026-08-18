import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * All tuning for Merge Game, grouped into nested objects (one object per "thing")
 * so related values live together instead of a flat wall of variables.
 * Distances are DESIGN px (the 390×844 canvas everything is authored in).
 */
export class MergeGameConfig {
  public readonly title = "Merge Game";

  /** Fixed design resolution everything is authored in; the framework viewport
   * letterboxes it to the canvas. */
  public readonly design = { width: 390, height: 844 };

  /** Trapezoid play area (faux-3D perspective: wider at the bottom). */
  public readonly board = {
    widthRatio: 0.86, // bottom edge width as a fraction of the screen width
    heightRatio: 0.62, // board height as a fraction of the screen height
    topScale: 0.78, // top edge width ÷ bottom edge width (perspective taper)
    centerY: 0.56, // vertical center as a fraction of the screen height
    // Vertical fade across the board (near/bottom → far/top) for depth, so it
    // doesn't read as a flat, artificial slab.
    fillTop: 0x223250, // far edge (top), darker
    fillBottom: 0x3f5a86, // near edge (bottom), lighter
    strokeColor: 0x5f7fac,
    strokeWidth: 14, // border thickness (design px) — bump for a chunkier frame
  };

  /** Dashed guide line across the board (perspective-aligned). */
  public readonly dash = {
    y: 600,
    color: 0xffffff,
    alpha: 0.4,
    length: 16,
    gap: 12,
    thickness: 3,
    inset: 24, // padding from the board edges
  };

  /** Danger line = the dashed line (`dash.y`). A ball whose near edge comes within
   * `warnGap` (game-space px) of it blinks the line red; a ball that crosses it
   * turns the line solid red. Crossing grants ONE grace launch — if a ball is
   * still across the line at the next launch, it's game over and the level resets
   * after `resetDelay` seconds. */
  public readonly dangerLine = {
    warnGap: 55, // near-edge distance (game px) at which the line starts blinking
    settleSpeed: 2, // only balls slower than this count — a ball still flying past never trips it
    color: 0xff3b30, // red for warn/crossed
    blinkRate: 4, // blinks per second while warning
    resetDelay: 1.2, // seconds the red line holds on game over before resetting
  };

  /** "FAIL" banner shown on game over — scales up (with a little overshoot) and
   * fades in over `inTime`, centered on the board. */
  public readonly fail = {
    text: "FAIL",
    color: 0xff3b30,
    fontSize: 84,
    inTime: 0.4, // scale-up + fade-in duration, seconds
    fromScale: 0.4, // starting scale (pops up to 1)
  };

  /** Goals shown at the top: each is "produce N of a tier". Producing that tier
   * flies the item up to its goal icon (collect) and drops the count; when all
   * hit 0 the level is complete. Per-level goals live on `levels.defs[].goals`. */
  public readonly goals = {
    rowY: 84, // panel center Y for the goal row (design)
    gap: 84, // horizontal spacing between goal panels
    // Rounded-rect panel that holds BOTH the item icon and its count.
    panelW: 62, // panel width (design px)
    panelH: 90, // panel height (design px)
    panelCorner: 16, // panel corner radius
    iconBg: 0x223250,
    iconBgStroke: 0x3f5a86,
    iconBgStrokeWidth: 3,
    iconRadius: 22, // goal icon size (design px)
    iconDy: -16, // icon center offset from the panel center (up)
    countDy: 26, // count center offset from the panel center (down)
    doneAlpha: 0.4, // completed goal fades to this
    checkColor: 0x5bd670, // completion tick color
    countColor: 0xe8eef6,
    countSize: 22,
    flyTime: 0.5, // collect silhouette fly-to-goal duration, seconds
    collectAlpha: 0.85, // opacity of the flying item-silhouette (the real item stays on the board)
    popAmp: 0.22, // goal card scale-up amount on a collect landing
    popTime: 0.28, // goal card up-down pop duration, seconds
    // Completion overlay:
    completeText: "AWESOME!",
    completeColor: 0xffe14a,
    completeSize: 68,
    inTime: 0.4, // banner scale-up + fade-in
    replayText: "Tekrar Oyna",
    replayColor: 0xffffff,
    replayBg: 0x2e7d32,
  };

  /** The item's appearance. Each launch randomly picks one of `kinds`; two items
   * of the SAME kind merge on contact. */
  public readonly item = {
    radius: 26, // base half-size
    scale: 0.5, // GLOBAL size multiplier (applied to every kind)
    poolSize: 40, // items pre-created (inactive) before the game starts
    maxSpawnTier: 3, // only tiers 0..this can launch (higher tiers come ONLY from merges)
    maxSameStreak: 3, // max times the SAME kind can load in a row → the next is forced different
    // Merge chain (each tier merges into the NEXT). `scale` is per-kind (effective
    // size = item.scale × kind.scale). `weight` is the relative spawn chance to the
    // launcher. `unlockAtMax` = the item only enters the launcher once the player
    // has produced a tier this high (i.e. it joins the pool as you progress).
    // Per-kind physics — the ONLY source (no global item default): `restitution`
    // (bounciness), `friction` (surface drag), `frictionAir` (air drag) differ for
    // EVERY item. Optional `density` (mass per area → heavier items shove lighter
    // ones) falls back to the engine default when omitted.
    kinds: [
      { shape: "circle", color: 0xffcf3f, scale: 0.9, weight: 55, unlockAtMax: 0, restitution: 0.07, friction: 0.9, frictionAir: 0.04 },
      { shape: "circle", color: 0x4aa3ff, scale: 1.5, weight: 40, unlockAtMax: 0, restitution: 0.09, friction: 0.7, frictionAir: 0.04 },
      { shape: "circle", color: 0x5bd670, scale: 2.4, weight: 8, unlockAtMax: 2, restitution: 0.09, friction: 0.7, frictionAir: 0.04 },
      { shape: "circle", color: 0xff6f61, scale: 3, weight: 3, unlockAtMax: 3, restitution: 0.09, friction: 0.7, frictionAir: 0.045 },
      { shape: "circle", color: 0x9b5cf0, scale: 3.6, weight: 8, unlockAtMax: 4, restitution: 0.09, friction: 0.7, frictionAir: 0.045 },
      { shape: "circle", color: 0xff934a, scale: 4.4, weight: 5, unlockAtMax: 5, restitution: 0.09, friction: 0.7, frictionAir: 0.049 },
      { shape: "circle", color: 0xff5fa2, scale: 5, weight: 0, unlockAtMax: 6, restitution: 0.09, friction: 0.7, frictionAir: 0.05 },
      { shape: "circle", color: 0x2fd0c0, scale: 5.6, weight: 0, unlockAtMax: 7, restitution: 0.09, friction: 0.7, frictionAir: 0.05 },
      { shape: "circle", color: 0xd94f6a, scale: 6.3, weight: 0, unlockAtMax: 8, restitution: 0.09, friction: 0.7, frictionAir: 0.052 },
    ] as {
      shape: "circle" | "square";
      color: number;
      scale: number;
      weight: number;
      unlockAtMax: number;
      restitution: number;
      friction: number;
      frictionAir: number;
      density?: number;
    }[],
  };

  /** Starting levels: the board can begin pre-populated with balls. `start` picks
   * the 1-based level; each level's `maxTier` unlocks launchable kinds up to that
   * tier, and `balls` are pre-placed items (`kind` = tier index; `x`/`y` are
   * normalized 0–1 over the game space — x across the width, y near→far). */
  public readonly levels = {
    start: 1, // 1-based level to start on
    defs: [
      // Level 1 — empty board; goal: produce one each of the top three tiers
      // (the 7th, 8th and 9th items → kind indices 6, 7, 8).
      {
        maxTier: 0,
        balls: [],
        goals: [
          { tier: 6, count: 1 },
          { tier: 7, count: 1 },
          { tier: 8, count: 1 },
        ],
      },
      // Level 2 — low-tier balls piled at the FAR end (top) of the play area;
      // tier-2 already unlocked.
      {
        maxTier: 2,
        balls: [
          { kind: 2, x: 0.5, y: 0.92 },
          { kind: 1, x: 0.28, y: 0.93 },
          { kind: 1, x: 0.72, y: 0.93 },
          { kind: 0, x: 0.2, y: 0.83 },
          { kind: 0, x: 0.42, y: 0.83 },
          { kind: 0, x: 0.6, y: 0.83 },
          { kind: 0, x: 0.8, y: 0.83 },
          { kind: 1, x: 0.5, y: 0.75 },
        ],
      },
      // Level 3 — a crowded board: 40 balls (mostly small tiers 0/1 in a checker
      // pattern + a few tier-2), laid out so nothing auto-merges at start.
      {
        maxTier: 3,
        balls: [
          { kind: 0, x: 0.17, y: 0.94 },
          { kind: 1, x: 0.34, y: 0.94 },
          { kind: 0, x: 0.5, y: 0.94 },
          { kind: 1, x: 0.66, y: 0.94 },
          { kind: 0, x: 0.83, y: 0.94 },
          { kind: 1, x: 0.17, y: 0.87 },
          { kind: 0, x: 0.34, y: 0.87 },
          { kind: 2, x: 0.5, y: 0.87 },
          { kind: 0, x: 0.66, y: 0.87 },
          { kind: 1, x: 0.83, y: 0.87 },
          { kind: 0, x: 0.17, y: 0.8 },
          { kind: 1, x: 0.34, y: 0.8 },
          { kind: 0, x: 0.5, y: 0.8 },
          { kind: 1, x: 0.66, y: 0.8 },
          { kind: 0, x: 0.83, y: 0.8 },
          { kind: 2, x: 0.17, y: 0.73 },
          { kind: 0, x: 0.34, y: 0.73 },
          { kind: 1, x: 0.5, y: 0.73 },
          { kind: 0, x: 0.66, y: 0.73 },
          { kind: 2, x: 0.83, y: 0.73 },
          { kind: 0, x: 0.17, y: 0.66 },
          { kind: 1, x: 0.34, y: 0.66 },
          { kind: 0, x: 0.5, y: 0.66 },
          { kind: 1, x: 0.66, y: 0.66 },
          { kind: 0, x: 0.83, y: 0.66 },
          { kind: 1, x: 0.17, y: 0.59 },
          { kind: 0, x: 0.34, y: 0.59 },
          { kind: 2, x: 0.5, y: 0.59 },
          { kind: 0, x: 0.66, y: 0.59 },
          { kind: 1, x: 0.83, y: 0.59 },
          { kind: 0, x: 0.17, y: 0.52 },
          { kind: 2, x: 0.34, y: 0.52 },
          { kind: 0, x: 0.5, y: 0.52 },
          { kind: 1, x: 0.66, y: 0.52 },
          { kind: 2, x: 0.83, y: 0.52 },
          { kind: 1, x: 0.17, y: 0.45 },
          { kind: 0, x: 0.34, y: 0.45 },
          { kind: 1, x: 0.5, y: 0.45 },
          { kind: 0, x: 0.66, y: 0.45 },
          { kind: 1, x: 0.83, y: 0.45 },
        ],
      },
      // Level 4 — TEST: empty board that auto-fires ALL tiers (random) at random X,
      // at 3× the base interval.
      { maxTier: 8, balls: [], autoFire: true, fireAll: true, fireInterval: 0.75 },
    ] as {
      maxTier: number;
      balls: { kind: number; x: number; y: number }[];
      autoFire?: boolean; // auto-launch continuously at random X (test level)
      fireKind?: number; // force the launched tier (test)
      fireAll?: boolean; // auto-fire picks a UNIFORMLY random tier among all kinds (test)
      fireInterval?: number; // per-level auto-fire interval (seconds); falls back to debug default
      goals?: { tier: number; count: number }[]; // produce N of `tier` to complete the level
    }[],
  };

  /** Merge: two same-kind items interact by their edge-to-edge SURFACE gap
   * (game-space px, so it works at any scale). Two distance bands:
   *  - ATTRACT: while the gap is in `(gap, attractGap]`, the pair is gently pulled
   *    toward each other (a slow "magnetic" drift) — `attractSpeed` sets the drift
   *    speed, `attractSmoothing` how quickly the velocity eases into it.
   *  - MERGE: once the gap ≤ `gap`, the classic merge runs.
   * Then on contact BOTH start together: the pair slides to the meeting point over
   * `pullTime` (keep this SHORTER than `shrinkTime` so the rush-together happens
   * while they're still big — a visible pull), and scales down to nothing over
   * `shrinkTime`; then the upgraded item pops. */
  public readonly merge = {
    gap: 12, // merge when the surface gap ≤ this
    attractGap: 18, // start the slow pull when the surface gap ≤ this (and > gap)
    attractSpeed: 20, // drift speed toward the partner (matter velocity units; launch is 12)
    attractSmoothing: 20, // how fast velocity eases into the pull (higher = snappier)
    pullTime: 0.11, // fast slide together (visible rush), seconds
    shrinkTime: 0.17, // scale-down to nothing (also starts at contact), seconds
  };

  /** Guide overlay: the straight game-space walls + vertical lanes, projected onto
   * the board (white, semi-opaque) — a launched item that stays on a lane is proof
   * it travels linearly. Turn off with `show: false`. */
  public readonly guides = {
    show: true,
    color: 0xffffff,
    alpha: 0.25,
    lanes: 4, // number of columns (lane lines = lanes - 1)
    thickness: 2,
  };

  /** Launcher — the item you aim from the bottom (near) edge. */
  public readonly launcher = {
    y: 670, // fixed Y in design px
    edgePad: 18, // extra gap kept from the board edges
    moveSmoothing: 26, // exp. smoothing rate as it eases toward the pointer
    reloadDelay: 0.65, // seconds after a launch before the next item appears
    spawnTime: 0.2, // scale-up (pop-in) duration for the new item, seconds
  };

  /** Aim strip (pointed, fading ribbon shown while aiming). */
  public readonly aim = {
    length: 280,
    baseWidth: 6, // tapers to a point at the top
    color: 0xffffff,
    alpha: 0.9, // at the base; fades to 0 at the tip
  };

  /** Launch physics (matter-js). Per-ITEM bounciness/friction/air-drag live on
   * each `item.kinds` entry; only world- and wall-level physics live here. */
  public readonly physics = {
    launchSpeed: 30, // initial upward speed (matter velocity units)
    gravityY: 0, // downward pull toward the player (0 = none)
    spin: false, // false = keep orientation (shaded ball's highlight stays fixed); true = tumble
    wallThickness: 24, // collider thickness for the trapezoid walls
    // Far (top) wall position as a fraction of the game height (1 = board top).
    // Lower it (<1) to shrink the PLAYABLE area from the top — the board VISUAL is
    // unaffected (drawn independently), so a dead band appears above the ceiling.
    topWall: 0.98,
    wall: { restitution: 0.18, friction: 0.75 }, // the board walls (shared by all items)
    // Collider size as a fraction of the item's visual half-size. 1 = exactly the
    // item (collider never sticks out past the visual); <1 shrinks it inward.
    colliderScale: 1.0,
    // DEBUG: draw a bright outline at the REAL collider edge so you can see it
    // vs the visual. Turn off (or via game-config.json) once tuned.
    showColliders: false,
    colliderOutline: { color: 0x00ff88, width: 2, alpha: 0.95 },
  };

  /** Vertical gradient backdrop (top → bottom). */
  public readonly background = {
    top: 0x9aa0a6, // flat gray (same top & bottom = solid, no gradient)
    bottom: 0x9aa0a6,
  };

  /** Merge burst effect: a semicircle shockwave at the merge point — opaque at the
   * outer rim, fading to transparent toward the center (and along the diameter) —
   * that expands and fades to show the merge "force". */
  public readonly effects = {
    merge: {
      color: 0xffffff,
      opacity: 0.2, // overall opacity of the burst (0–1)
      radius: 80, // max outer radius it expands to (design px)
      time: 0.2, // seconds
      bands: 100, // radial fade resolution
      innerRatio: 0.01, // transparent inside this fraction of the radius
    },
    // Star particle burst — fires once when the merged (upgraded) item appears:
    // stars spawn at the point, spread outward, and fade ("one snap").
    stars: {
      color: 0xffd23f, // star color (adjustable)
      count: 4, // particles per burst
      size: 9, // star radius (design px)
      speed: 200, // outward speed (design px/s)
      drag: 3, // velocity damping per second
      spin: 1.9, // rotation speed (rad/s)
      gravity: 0, // downward pull (design px/s²; 0 = none)
      time: { min: 0.5, max: 0.9 }, // per-particle lifetime, seconds
      max: 10, // particle budget cap
    },
  };

  /** Item drop shadow. A soft dark ellipse under each item, offset AWAY from the
   * light. `angle` is the light direction in degrees; the shadow is cast opposite. */
  public readonly shadow = {
    enabled: true,
    color: 0x000000,
    alpha: 0.18,
    angle: 240, // light direction, degrees (0 = →, 90 = ↓ in screen space)
    distance: 10, // shadow offset from the item center (design px)
    scale: 1.1, // shadow size relative to the item
    squash: 0.7, // vertical squash (1 = round, <1 = flatter ellipse)
  };

  /** Test-only toggles — revert when done tuning. */
  public readonly debug = {
    onlyShape: null as "circle" | "square" | null, // launch only this shape (null = normal mix)
    disableMerge: false, // true = no attraction + no merge (test raw item physics)
    autoFireInterval: 0.25, // seconds between shots on an auto-fire level (e.g. level 4)
  };

  /** Letterbox: clamp the visible play area to an aspect range (width ÷ height). */
  public readonly letterbox = { minAspect: 0.39, maxAspect: 2.55, color: 0x000000 };

  public readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0,
    },
  };
}
