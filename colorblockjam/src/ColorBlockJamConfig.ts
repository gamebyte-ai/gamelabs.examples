import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";
import { SHAPES, type LevelDescriptor } from "./constants/LevelSchema.js";

export class ColorBlockJamConfig {
  // ─── Camera ────────────────────────────────────────────────────────────
  // Orbital 3D camera (see `Orbital3dCameraController`). Edit these
  // numbers to reframe the grid: distance pushes the camera back,
  // pitch is the angle above the horizon (π/2 ≈ straight-down),
  // azimuth rotates around the focus point's Y axis, and the focus
  // triple is the world-space point the camera looks at.

  /** World units between camera and its focus point. */
  public readonly cameraDistance = 10;
  /** Radians above the horizon. `π/2` is a pure top-down view. */
  public readonly cameraPitch = Math.PI / 2 - 0.22;
  /** Radians of rotation around the focus Y axis (0 looks along −Z). */
  public readonly cameraAzimuth = 0;
  public readonly cameraFocusX = 0;
  public readonly cameraFocusY = 0;
  public readonly cameraFocusZ = 0;

  // ─── Lighting ──────────────────────────────────────────────────────────
  // A single key directional light is added on top of the framework's
  // default ambient + overhead. Tweak its hue, strength, and angle to
  // change how studs and bevel edges catch light.

  /** Hex colour of the key light. Warm white by default. */
  public readonly keyLightColor = 0xfff4d6;
  /** Light strength (THREE.DirectionalLight intensity). */
  public readonly keyLightIntensity = 1.1;
  /** World position the key light shines from. */
  public readonly keyLightX = -3;
  public readonly keyLightY = 8;
  public readonly keyLightZ = -2;
  /** World point the key light is aimed at. */
  public readonly keyLightTargetX = 0;
  public readonly keyLightTargetY = 0;
  public readonly keyLightTargetZ = 0;

  // ─── Sky gradient ──────────────────────────────────────────────────────
  // Three-stop vertical gradient rendered as the scene background. Use
  // CSS-style hex strings so you can preview the colours easily.

  /** Top of the viewport. */
  public readonly skyTopColor = "#ffb074";
  /** Mid-transition colour. */
  public readonly skyMidColor = "#ccadff";
  /** Where the mid colour sits along the gradient (0 = top, 1 = bottom). */
  public readonly skyMidStop = 0.55;
  /** Bottom of the viewport. */
  public readonly skyBottomColor = "#0b1a3e";

  /** Side length of a grid cell in world units. */
  public readonly cellSize = 1.0;
  /** Vertical thickness of the base grid plate (cosmetic). */
  public readonly cellHeight = 0.08;
  /** Height of a block cube. Stands above the grid plate. */
  public readonly blockHeight = 0.2;
  /** Lift above blockHeight while a block is being dragged. */
  public readonly dragLiftAmount = 0.2;

  /**
   * Per-side margin (in cell units) subtracted from every block's
   * rendered footprint AND its collider. A block still logically occupies
   * the same grid cells — its visuals and collision footprint are each a
   * little smaller than a full cell, leaving a subtle gap on all four
   * sides. This gives drag collision a cushion so float drift near a
   * 1-cell gap can't make a shape "feel fat".
   *
   * Must be within the 0..0.5 range; `0.04` is subtle (~4% of cell).
   */
  public readonly blockMargin = 0.04;

  /**
   * Exponential smoothing time (seconds) for drag motion: each frame,
   * the block's rendered position eases toward the cursor's grid
   * position with factor `1 - exp(-dt / dragSmoothingTime)`. Smaller =
   * stiffer / snappier; larger = softer / more lag. 0.07s ≈ ~0.2 lerp
   * factor at 60 fps. Collision and grid-edge rules still apply to the
   * smoothed position at every frame.
   */
  public readonly dragSmoothingTime = 0.09;

  /** Color of the grid base plate. */
  public readonly gridBaseColor = 0x1e293b;
  /** Color of the outline around each grid cell. */
  public readonly gridLineColor = 0x475569;
  /** Color of a cell highlighted under the currently dragged block. */
  public readonly cellDragHighlightColor = 0x38bdf8;

  // ─── Gates / walls ────────────────────────────────────────────────────
  // Gates and walls share the same rounded-box silhouette and sit
  // flush against every grid edge cell. Gates carry a white arrow on
  // top pointing outward.

  /** Gate / wall height, expressed as a multiplier of {@link blockHeight}. */
  public readonly gateHeightMultiplier = 1.5;
  /** Rounded-corner radius for gate & wall corners (world units). */
  public readonly edgePieceCornerRadius = 0.08;
  /**
   * How thick (in world units) gates and walls stick out from the
   * grid edge toward the outside.
   */
  public readonly edgePieceDepth = 0.38;
  /**
   * Neutral gray palette for walls. Every wall picks one of these at
   * random so the border has subtle shade variation.
   */
  public readonly wallColors: readonly number[] = [0x6b7280, 0x7c8696, 0x8c95a3, 0x9ba4b0];
  /** White colour for the gate arrow caps. */
  public readonly gateArrowColor = 0xffffff;
  /** Arrow length along the outward direction (world units). */
  public readonly gateArrowLength = 0.36;
  /** Arrow base width perpendicular to the outward direction. */
  public readonly gateArrowWidth = 0.3;
  /** Arrow extrusion thickness in Y. */
  public readonly gateArrowThickness = 0.06;
  /** Vertical gap between the gate top and the arrow's underside. */
  public readonly gateArrowLift = 0.01;

  /**
   * Thickness (world units) of the white silhouette outline drawn around
   * the currently dragged block. Pushed along each vertex's normal by
   * the outline shader, so a uniform value gives a clean fringe at every
   * camera angle. `0.045` ≈ 4.5% of a cell.
   */
  public readonly selectionOutlineThickness = 0.045;

  /** Palette indexed by `colorIndex` on blocks / doors. */
  public readonly colors: readonly number[] = [
    0xef4444, // 0: red
    0x22c55e, // 1: green
    0x3b82f6, // 2: blue
    0xeab308, // 3: yellow
    0xa855f7, // 4: purple
  ];

  /**
   * Snap tolerance (fraction of a cell) used when checking if a dragged
   * block is "parked" in the cell(s) directly in front of a door — i.e.
   * both its col and row float coords round to integers within this
   * distance. Below it the block is considered aligned for auto-exit.
   */
  public readonly exitAlignTolerance = 0.22;

  /**
   * Duration (seconds) of the block-through-gate slide. The block tweens
   * outward through the gate and is clipped against the grid edge so it
   * visibly "disappears" into the gate over this window.
   */
  public readonly exitAnimationSeconds = 0.25;

  /**
   * How far (in grid cells) the block's anchor travels past the grid
   * edge during the exit animation. Enough for every cell of the
   * block's footprint to cross the clip plane plus a small margin.
   */
  public readonly exitAnimationDistanceCells = 2.2;

  // ─── Exit particle burst ──────────────────────────────────────────────
  // Small colored cubes spawned on the outside of the gate when a block
  // starts its exit, flying outward to sell "the block is being ground
  // up as it enters the gate".

  /**
   * Number of particles spawned **per occupied gate cell**. A 1-cell
   * door emits this many; a 3-cell door emits 3× this many total, and
   * each cell gets its own spawn origin along the gate's span so the
   * shred effect covers the full door opening.
   */
  public readonly exitParticlesPerCell = 15;
  /** Edge length (world units) of each particle cube. */
  public readonly exitParticleSize = 0.20;
  /** Minimum lifetime in seconds; randomised up to `+LifetimeJitter`. */
  public readonly exitParticleLifetime = 0.55;
  public readonly exitParticleLifetimeJitter = 0.3;
  /** Average outward travel in world units over the particle's lifetime. */
  public readonly exitParticleSpeed = 1.4;
  /** Lateral/vertical spread around the outward direction. */
  public readonly exitParticleSpread = 2.5;

  // ─── Gate button-press ────────────────────────────────────────────────
  // The gate always squashes along its own HEIGHT axis (world Y), pivoting
  // from its base — the top descends, the base stays planted — and then
  // springs back to full height. The animation starts the instant a
  // match is confirmed and finishes at the same moment as the block's
  // travel-to-gate tween (total duration = `exitAnimationSeconds`).

  /** Minimum Y scale at the bottom of the squash (1 = full height). */
  public readonly gatePressScale = 0.25;
  /**
   * Fraction of the exit duration spent squashing down. The remaining
   * fraction (1 − this) is the spring-back. Both add up to
   * `exitAnimationSeconds`.
   */
  public readonly gatePressDownFraction = 0.4;

  /**
   * Five hand-authored levels of increasing difficulty. Each level is pure
   * data (grid size + block list + door list) so adding or re-ordering
   * levels only means editing this array.
   *
   * Difficulty progression (size / blocks / chains):
   *  1 — 5×5, 3 blocks, 1 chain (intro: a 1×1 blocker sits on the
   *      1×3's path to its top gate).
   *  2 — 6×6, 4 blocks, 2 chains (yellow at the bottom is pinned by a
   *      2×2 green and a stray red; blue slides past cleanly).
   *  3 — 6×7, 5 blocks, one 3-level chain (Blue → Red → Yellow) plus
   *      Green → Yellow; purple L-shape exits independently.
   *  4 — 6×8, 6 blocks, includes two reds of different sizes. The
   *      purple L can only reach its top gate after BOTH reds move
   *      (one on row 4 plus the 2×2 red wall at cols 4-5 rows 2-3).
   *      Green → Yellow on the other side.
   *  5 — 7×8, 7 blocks, a 3-level chain plus two side chains.
   *      Purple L → Red 1×1 → Green 1×1 (green's only gate is on top,
   *      red blocks its column, and the purple L-shape pins red's path
   *      to its right gate). Blue → Red L-shape on the bottom-right.
   *      Green 2×2 → Yellow on the left.
   *
   * Doors on the same side never overlap. Colour indices reference
   * {@link colors}: 0 red, 1 green, 2 blue, 3 yellow, 4 purple.
   */
  public readonly levels: readonly LevelDescriptor[] = [
    // ── Level 1 ── 5×5, 3 blocks, 1 dependency.
    // Red 1×1 at (1, 2) sits on yellow's upward path. Slide red left to
    // its gate, then the 1×3 yellow can reach the top. Green 2×2 is
    // already parked in front of its right gate — pick it up and it
    // auto-clears.
    {
      cols: 5,
      rows: 5,
      blocks: [
        { id: 0, colorIndex: 3, shape: SHAPES.rect1x3, anchor: { col: 0, row: 4 } }, // yellow
        { id: 1, colorIndex: 0, shape: SHAPES.square1x1, anchor: { col: 1, row: 2 } }, // red
        { id: 2, colorIndex: 1, shape: SHAPES.square2x2, anchor: { col: 3, row: 0 } }, // green
      ],
      doors: [
        { id: 0, side: "top", spanStart: 0, spanEnd: 2, colorIndex: 3 }, // yellow top
        { id: 1, side: "left", spanStart: 2, spanEnd: 2, colorIndex: 0 }, // red left
        { id: 2, side: "right", spanStart: 0, spanEnd: 1, colorIndex: 1 }, // green right
      ],
    },

    // ── Level 2 ── 6×6, 4 blocks, 2 chains.
    // Yellow 1×3 (bottom-left) needs rows 2-3 at cols 0-2 cleared.
    // A 2×2 green and a red 1×1 jointly fence off those rows. Blue
    // 1×2 on the top row slides straight down to its own bottom gate
    // without affecting yellow's path.
    {
      cols: 6,
      rows: 6,
      blocks: [
        { id: 0, colorIndex: 3, shape: SHAPES.rect1x3, anchor: { col: 0, row: 5 } }, // yellow
        { id: 1, colorIndex: 0, shape: SHAPES.square1x1, anchor: { col: 2, row: 3 } }, // red
        { id: 2, colorIndex: 1, shape: SHAPES.square2x2, anchor: { col: 0, row: 2 } }, // green
        { id: 3, colorIndex: 2, shape: SHAPES.rect1x2, anchor: { col: 3, row: 0 } }, // blue
      ],
      doors: [
        { id: 0, side: "top", spanStart: 0, spanEnd: 2, colorIndex: 3 },
        { id: 1, side: "right", spanStart: 3, spanEnd: 3, colorIndex: 0 },
        { id: 2, side: "left", spanStart: 2, spanEnd: 3, colorIndex: 1 },
        { id: 3, side: "bottom", spanStart: 3, spanEnd: 4, colorIndex: 2 },
      ],
    },

    // ── Level 3 ── 6×7, 5 blocks, 3-level chain + 1 side chain.
    // Red 1×1 sits at the left edge of row 3 and wants to reach its
    // right gate, but a blue 1×2 is parked across cols 3-4 of the same
    // row. Blue's own gate is on the top, so: Blue → Red → Yellow
    // (yellow can't reach anchor (0, 0) until red vacates col 0 row 3).
    // Green 2×2 parks in front of its left gate; purple L starts on its
    // bottom gate.
    {
      cols: 6,
      rows: 7,
      blocks: [
        { id: 0, colorIndex: 3, shape: SHAPES.rect1x3, anchor: { col: 0, row: 5 } }, // yellow
        { id: 1, colorIndex: 0, shape: SHAPES.square1x1, anchor: { col: 0, row: 3 } }, // red
        { id: 2, colorIndex: 2, shape: SHAPES.rect1x2, anchor: { col: 3, row: 3 } }, // blue
        { id: 3, colorIndex: 1, shape: SHAPES.square2x2, anchor: { col: 0, row: 1 } }, // green
        { id: 4, colorIndex: 4, shape: SHAPES.lShape, anchor: { col: 3, row: 5 } }, // purple L
      ],
      doors: [
        { id: 0, side: "top", spanStart: 0, spanEnd: 2, colorIndex: 3 },
        { id: 1, side: "right", spanStart: 3, spanEnd: 3, colorIndex: 0 },
        { id: 2, side: "top", spanStart: 3, spanEnd: 4, colorIndex: 2 },
        { id: 3, side: "left", spanStart: 1, spanEnd: 2, colorIndex: 1 },
        { id: 4, side: "bottom", spanStart: 3, spanEnd: 4, colorIndex: 4 },
      ],
    },

    // ── Level 4 ── 6×8, 6 blocks, all 5 shape families, purple L
    // blocked by two reds of different sizes. A red 2×2 sits on rows
    // 2-3 at cols 4-5 (already aligned with its right gate — pick it
    // up and it clears). A red 1×1 sits on row 4. Purple L at (3, 5)
    // can only reach its top gate after BOTH reds are out of the way.
    // Green 2×2 → Yellow on the left side; blue is an independent
    // bottom exit.
    {
      cols: 6,
      rows: 8,
      blocks: [
        { id: 0, colorIndex: 3, shape: SHAPES.rect1x3, anchor: { col: 0, row: 5 } }, // yellow
        { id: 1, colorIndex: 0, shape: SHAPES.square1x1, anchor: { col: 3, row: 4 } }, // red 1×1
        { id: 2, colorIndex: 0, shape: SHAPES.square2x2, anchor: { col: 4, row: 2 } }, // red 2×2
        { id: 3, colorIndex: 2, shape: SHAPES.rect1x2, anchor: { col: 0, row: 6 } }, // blue
        { id: 4, colorIndex: 1, shape: SHAPES.square2x2, anchor: { col: 1, row: 3 } }, // green
        { id: 5, colorIndex: 4, shape: SHAPES.lShape, anchor: { col: 3, row: 5 } }, // purple L
      ],
      doors: [
        { id: 0, side: "top", spanStart: 0, spanEnd: 2, colorIndex: 3 },
        { id: 1, side: "right", spanStart: 4, spanEnd: 4, colorIndex: 0 },
        { id: 2, side: "right", spanStart: 2, spanEnd: 3, colorIndex: 0 },
        { id: 3, side: "bottom", spanStart: 0, spanEnd: 1, colorIndex: 2 },
        { id: 4, side: "left", spanStart: 3, spanEnd: 4, colorIndex: 1 },
        { id: 5, side: "top", spanStart: 3, spanEnd: 4, colorIndex: 4 },
      ],
    },

    // ── Level 5 ── 7×8, 7 blocks, a 3-level chain plus two 2-level
    // chains. 7 blocks / 5 colours (red and green each appear on two
    // blocks of different sizes).
    //
    //  Chain A (3 levels): Purple L → Red 1×1 → Green 1×1.
    //    Purple L parks on cols 4-5 rows 2-3 and blocks red's path to
    //    its right gate on row 3. Red 1×1 in turn sits at (3, 3),
    //    blocking the green 1×1's only gate — a narrow top col-3 — so
    //    green 1×1 can only clear after red does.
    //  Chain B (2 levels): Blue 1×2 → Red L-shape.
    //    Blue parks on row 6 in the cells red L needs to slide through
    //    to reach its bottom 5-6 gate.
    //  Chain C (2 levels): Green 2×2 → Yellow.
    //    Yellow 1×3 at the bottom-left has to ascend to its top 0-2
    //    gate; green 2×2 covers cols 0-1 on rows 1-2 and must move
    //    first.
    {
      cols: 7,
      rows: 8,
      blocks: [
        { id: 0, colorIndex: 3, shape: SHAPES.rect1x3, anchor: { col: 0, row: 5 } }, // yellow
        { id: 1, colorIndex: 0, shape: SHAPES.square1x1, anchor: { col: 3, row: 3 } }, // red 1×1
        { id: 2, colorIndex: 2, shape: SHAPES.rect1x2, anchor: { col: 4, row: 6 } }, // blue
        { id: 3, colorIndex: 1, shape: SHAPES.square2x2, anchor: { col: 0, row: 1 } }, // green 2×2
        { id: 4, colorIndex: 4, shape: SHAPES.lShape, anchor: { col: 4, row: 2 } }, // purple L
        { id: 5, colorIndex: 0, shape: SHAPES.lShape, anchor: { col: 5, row: 4 } }, // red L
        { id: 6, colorIndex: 1, shape: SHAPES.square1x1, anchor: { col: 3, row: 5 } }, // green 1×1
      ],
      doors: [
        { id: 0, side: "top", spanStart: 0, spanEnd: 2, colorIndex: 3 },
        { id: 1, side: "right", spanStart: 3, spanEnd: 3, colorIndex: 0 },
        { id: 2, side: "right", spanStart: 6, spanEnd: 7, colorIndex: 2 },
        { id: 3, side: "left", spanStart: 1, spanEnd: 2, colorIndex: 1 },
        { id: 4, side: "top", spanStart: 4, spanEnd: 5, colorIndex: 4 },
        { id: 5, side: "bottom", spanStart: 5, spanEnd: 6, colorIndex: 0 },
        { id: 6, side: "top", spanStart: 3, spanEnd: 3, colorIndex: 1 },
      ],
    },
  ];

  public readonly transitions: { readonly gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0,
    },
  };
}
