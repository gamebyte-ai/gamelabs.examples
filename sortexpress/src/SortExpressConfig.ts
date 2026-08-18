import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * Application-level configuration bucket — title text, colors, sizes and
 * timings expected to change as the game is built out. Step-by-step gameplay
 * tuning lands here.
 */
export class SortExpressConfig {
  /** Game title shown on the start screen. */
  public readonly title = "Sort Express";
  /** Prompt under the title before the game begins. */
  public readonly tagline = "Başlamak için dokun";

  /** Screen width (px) the px-based UI sizes (fonts, bars) are designed for.
   * px content multiplies by safeW / referenceWidth to track the play-rect. */
  public readonly referenceWidth = 480;

  /** Fixed aspect (width/height) the gameplay is laid out at. The background
   * fills the whole canvas; the UI sits in the largest rect of THIS aspect,
   * centered. */
  public readonly gameplayAspect = 9 / 16;

  /** Dev shortcuts — turn these OFF for release. */
  public readonly debug: {
    /** Jump straight to the end screen on load (with a seeded sample result). */
    openEndScreen: boolean;
    /** Inspector: instead of the board, show ALL item kinds in one row along the
     * bottom of the screen — same size + same (upright) angle — to eyeball them. */
    showAllShapes: boolean;
  } = {
    openEndScreen: false,
    showAllShapes: false,
  };

  /** HUD palette. */
  public readonly colors: {
    /** Background gradient: top color → bottom color (vertical). */
    backgroundTop: number;
    background: number;
    title: number;
    tagline: number;
    accent: number;
  } = {
    backgroundTop: 0x1b2a4a,
    background: 0x0c1526,
    title: 0xffffff,
    tagline: 0xcdd9ef,
    accent: 0xffb020,
  };

  /** Start / tap-to-start overlay. */
  public readonly start: {
    /** Tap-prompt text (mirrors `tagline`, kept separate for the overlay view). */
    text: string;
    textColor: number;
    /** Prompt font size as a fraction of canvas height. */
    fontFraction: number;
  } = {
    text: this.tagline,
    textColor: 0xffffff,
    fontFraction: 0.045,
  };

  /** 3D world backdrop: a VERTICAL gradient behind the board — `edge` at the top +
   * bottom, `center` in the middle. `centerSpread` (0..1) is how much of the height
   * the middle colour occupies: small = a thin centre band (edges dominate), large
   * = a wide centre (edges only at the very top/bottom). */
  public readonly background: {
    edge: number;
    center: number;
    centerSpread: number;
  } = {
    edge: 0x1f398a,
    center: 0x3861b2,
    centerSpread: 0.7,
  };

  /** Board lighting. For EVEN light everywhere the board is mostly SELF-LIT: items
   * + shelves are emissive (`shapes.emissiveIntensity` / `frameEmissiveIntensity`),
   * so no light direction can darken one row/side — the World's default overhead
   * directional can't create a top-bright/bottom-dark gradient. A flat uniform
   * `ambientIntensity` lifts everything equally. `intensity` (a directional key)
   * and `hemiIntensity` (sky/ground gradient) are OFF by default (0) since either
   * reintroduces direction-based shading; raise them only if you want some form.
   * A light with intensity 0 is skipped entirely.
   * NOTE: DirectionalLight is a PARALLEL light — only its DIRECTION (position →
   * origin) matters, never its distance; moving `position` along the same line
   * does nothing. (Use a PointLight if you want position/distance to matter.) */
  public readonly light: {
    color: number;
    intensity: number;
    /** Where the key light shines FROM (world units). */
    position: { x: number; y: number; z: number };
    /** Where it aims — the light's ANGLE = direction from `position` to `target`. */
    target: { x: number; y: number; z: number };
    ambientIntensity: number;
    ambientColor: number;
    /** Emissive strength of the shelf frame (0 = lit only, 1 ≈ flat/unlit). */
    frameEmissiveIntensity: number;
    hemiIntensity: number;
    hemiSky: number;
    hemiGround: number;
  } = {
    color: 0xffffff,
    intensity: 1.2,
    position: { x: 3, y: 5, z: 25 },
    target: { x: 0, y: 16, z: 0 },
    ambientIntensity: 0.6,
    ambientColor: 0xffffff,
    frameEmissiveIntensity: 0.4,
    hemiIntensity: 0.2,
    hemiSky: 0xffffff,
    hemiGround: 0x4a5a72,
  };

  /**
   * Orthographic camera framing the board (parallel projection — no perspective
   * distortion). Responsive like Triple Match 3D: between `minAspect` (narrow)
   * and `maxAspect` (wide) the frustum HEIGHT lerps `frustumAtMin → frustumAtMax`
   * (clamped outside the band), while the width always follows the true aspect so
   * nothing stretches. Narrow/portrait screens want a TALLER frustum to fit the
   * board width, so `frustumAtMin` is larger than `frustumAtMax`.
   */
  public readonly camera: {
    position: { x: number; y: number; z: number };
    lookAt: { x: number; y: number; z: number };
    zoom: {
      minAspect: number;
      maxAspect: number;
      frustumAtMin: number;
      frustumAtMax: number;
    };
  } = {
    // Diagonal view: raised above the board + in front, looking at its center →
    // a gentle top-down angle (raise position.y for a steeper tilt).
    position: { x: 0, y: 5, z: 30 },
    lookAt: { x: 0, y: 0, z: 0 },
    zoom: {
      minAspect: 0.45,
      maxAspect: 0.62,
      frustumAtMin: 25,
      frustumAtMax: 21,
    },
  };

  /**
   * Board = a cabinet: a GRID of cells (`cols` × `rows`). Each cell is a
   * framed compartment holding a STACK of layers (`layersPerCell`); every layer
   * is a row of `slotsPerLayer` slots, randomly filled with `minPerLayer..
   * maxPerLayer` objects (the rest are gaps, leaving room to drag). Only the
   * FRONT layer is interactive; deeper layers sit further back, smaller + dimmed,
   * and slide forward when the layer ahead of them clears.
   */
  public readonly board: {
    /** Compartments side by side (X). */
    cols: number;
    /** Compartments stacked (Y). */
    rows: number;
    /** Slots (side by side) on each layer. */
    slotsPerLayer: number;
    /** Depth layers stacked in each compartment. */
    layersPerCell: number;
    /** Per-layer fill count when generating (rest are gaps). Keep max BELOW
     * slotsPerLayer so no layer is a pre-made full set + there's drag room. */
    minPerLayer: number;
    maxPerLayer: number;
    /** Item kinds in play, by code (C/Y/S/O/P/T/H/D/R/A). The generator scatters
     * these across the board. */
    activeKinds: string[];
    /** Colour VARIANTS per kind that count as distinct matchable items (1..N,
     * indexes into shapes.colorsPerKind). 1 = a single colour per kind. */
    variants: number;
    /** THE AMOUNT KNOB. How many complete 3-of-a-kind SETS of EACH active kind to
     * scatter → per-kind total = setsPerKind × slotsPerLayer (always a multiple of
     * 3, so the board is fully clearable — no leftovers). Set it to control the
     * game length:
     *   1 → 3 per kind (1 match each) — quick, for testing the end / win flow
     *   2 → 6 per kind (current)
     *   4 → 12 per kind — the future "double" (denser cells; the generator fills
     *       layers fully as needed, never dropping items, so 3-packs stay intact).
     * Cap: total (kinds × setsPerKind × slotsPerLayer) must fit cols·rows·layers·slots. */
    setsPerKind: number;
    /** Compartment width (X) and height (Y) — tune independently. */
    cellWidth: number;
    cellHeight: number;
    /** Horizontal gap between COLUMNS (X) and vertical gap between ROWS (Y),
     * independently. */
    colGap: number;
    rowGap: number;
    /** Compartment DEPTH (Z) — an open-front box: back wall + floor + side/top
     * walls, so each cell reads as a rectangular shelf with depth. */
    cellDepth: number;
    /** Thickness of the shelf walls / floor. */
    wallThickness: number;
    /** Corner rounding of the cell frame (world units, 0 = sharp) — rounds BOTH the
     * outer rect AND the inner opening / side walls. Auto-capped to the max valid
     * for the cell + opening size. */
    cornerRadius: number;
    /** Shell color (floor, side + top walls). */
    borderColor: number;
    /** Back-wall color (the "son" — darker, so depth reads). */
    interiorColor: number;
    /** TOP-wall (ceiling) color — overlaid on the top bar of each cell so the top
     * reads differently from the side/bottom border. null = same as `borderColor`. */
    ceilingColor: number | null;
    /** Spacing between slots inside a layer, as a fraction of cellSize. */
    itemSpacingFraction: number;
    /** FRONT-ROW depth: the Z plane the front row's FRONT FACE sits on (all kinds
     * are front-aligned to it). RAISE to bring the front row toward the camera /
     * the cell opening (looks less "sunk in"); lower to push it back. Keep it below
     * the cell's front edge (cellDepth/2) so items stay inside the shelf. */
    itemZ: number;
    /** Gap between the cell's interior floor and the bottom of the objects
     * resting on it (world units) — items sit ON the floor, not centered. */
    itemFloorMargin: number;
    /** DEPTH margin between stacked layers (world units) — the gap between ANY two
     * rows. Must exceed the item's own Z-depth (≈ scale) or the front + back models
     * intersect. Raising it needs a deeper `cellDepth` so back rows don't poke
     * through the back wall (keep (layersPerCell−1)·layerDepthZ + itemDepth/2 <
     * itemZ + cellDepth/2). */
    layerDepthZ: number;
    /** Scale multiplier applied per layer behind the front (compounding). */
    behindScale: number;
    /** Brightness multiplier applied per layer behind the front (compounding). */
    behindDim: number;
  } = {
    cols: 3,
    rows: 6,
    slotsPerLayer: 3,
    layersPerCell: 3,
    minPerLayer: 1,
    maxPerLayer: 2,
    activeKinds: ["C", "Y", "S", "O", "R"],
    variants: 2,
    setsPerKind: 2,
    cellWidth: 3.8,
    cellHeight: 2.9,
    colGap: -0.1,
    rowGap: -0.1,
    cellDepth: 1.9,
    wallThickness: 0.09,
    cornerRadius: 0.2,
    borderColor: 0xc4e9ff,
    interiorColor: 0x283c5d,
    ceilingColor: 0x7fa8d0,
    itemSpacingFraction: 0.3,
    itemZ: 1.3,
    itemFloorMargin: 0.1,
    layerDepthZ: 0.9,
    behindScale: 0.82,
    behindDim: 0.3,
  };

  /**
   * OPTIONAL hand-authored level. When NON-EMPTY it overrides the generator:
   * one entry per cell, ROW-MAJOR (index = row*cols + col), each listing the
   * cell's layers FRONT→BACK as `slotsPerLayer`-char code strings. Codes: C cube ·
   * Y cylinder · S sphere · O cone · P pyramid · T triPrism · H hexPrism ·
   * D octahedron · R torus · A capsule · `.` empty gap. Empty cell = `[]`.
   *
   * Left EMPTY here → the board is generated by scattering `board.activeKinds`
   * across the cells, `board.setsPerKind` sets of each (see board block).
   */
  public readonly level: string[][] = [];

  /**
   * Object appearance. `scale` sizes the ~1-unit primitives; `colorsPerKind` gives
   * each kind its colour variants (each colour = a distinct matchable item);
   * material finish is shared.
   */
  public readonly shapes: {
    scale: number;
    /** COLOUR VARIANTS per kind (keyed by kind name): each kind has 2 colours, and
     * each (kind, colour) is a distinct matchable item — you match 3 of the SAME
     * shape AND SAME colour. The array length is the variant count (keep it 2 to
     * match board generation). */
    colorsPerKind: Record<string, number[]>;
    roughness: number;
    metalness: number;
    /** Self-lit glow so items read bright + saturated + EVEN regardless of light
     * direction (0 = fully lit/shaded, 1 ≈ flat unlit). Drives the even-light look. */
    emissiveIntensity: number;
    /** The CUBE's fixed resting orientation in the cell (degrees, baked into its
     * geometry so drag-sway still works on top). e.g. y:45 shows an edge/corner
     * front instead of a flat face. Only affects the cube. */
    cubeRotation: { x: number; y: number; z: number };
    /** PER-KIND size multiplier on top of `scale` (keyed by kind name; 1 = just
     * `scale`). Geometries are normalized to a common height, so this fine-tunes
     * any single kind that reads too big/small — independently of the others. */
    scalePerKind: Record<string, number>;
    /** PER-KIND VERTICAL stretch (Y only; keyed by kind name; 1 = unchanged).
     * Baked into the shared geometry, so a kind can be made TALLER without widening
     * it (e.g. a taller cube reads as a rectangular box). Seating auto-adjusts. */
    heightPerKind: Record<string, number>;
    /** PER-KIND forward/back nudge (world units, +Z = toward camera) applied on
     * top of the front-face alignment. 0 = fronts aligned; raise a kind to bring it
     * a bit more forward if the flush-front look reads oddly for that shape. */
    zOffsetPerKind: Record<string, number>;
  } = {
    scale: 0.9,
    colorsPerKind: {
      cube: [0xff2b1f, 0x00d1e0], //     red    | cyan
      cylinder: [0xff8400, 0x1e90ff], // orange | azure
      sphere: [0xffd400, 0x2f3bff], //   yellow | blue
      cone: [0x9be000, 0xa030ff], //     lime   | violet
      torus: [0x1fcc3a, 0xe000ff], //    green  | magenta
      capsule: [0x00d68f, 0xff1f8f], //  emerald| hot pink
    },
    roughness: 0.5,
    metalness: 0.0,
    emissiveIntensity: 0.0,
    cubeRotation: { x: 1, y: 0, z: 0 },
    scalePerKind: {
      cube: 1.2,
      cylinder: 1.25,
      sphere: 1.3,
      cone: 1.27,
      torus: 1.3,
      capsule: 1.2,
    },
    heightPerKind: {
      cube: 1.25,
      cylinder: 1.5,
      sphere: 1,
      cone: 1.1,
      torus: 1,
      capsule: 1,
    },
    zOffsetPerKind: {
      cube: 0,
      cylinder: 0,
      sphere: 0.2,
      cone: 0,
      torus: 0,
      capsule: 0,
    },
  };

  /**
   * Drag-and-drop. The picked front-layer item follows the pointer via a
   * frame-rate-independent LERP (`k = 1 - exp(-lerpSpeed·dt)`): higher
   * `lerpSpeed` = tighter/snappier follow, lower = looser/laggier. `liftZ` is how
   * far IN FRONT of the cabinet's front edge (cellDepth/2) the grabbed item floats
   * while dragged — enough to clear the shelf frames (no clipping through walls) +
   * render on top. On release (no match yet) it lerps back to its home slot;
   * `snapEpsilon` is the distance (world units) at which it snaps home + ends the
   * drag. */
  public readonly drag: {
    lerpSpeed: number;
    liftZ: number;
    snapEpsilon: number;
    /** Natural "held + swinging" sway while dragging: the item tilts by how far
     * it lags behind the pointer (∝ drag speed), easing back to upright when
     * still / on release. `tilt` = radians of lean per world-unit of lag;
     * `maxAngle` clamps it (radians). Set tilt 0 to disable. */
    sway: { tilt: number; maxAngle: number };
  } = {
    lerpSpeed: 16,
    liftZ: 0.6,
    snapEpsilon: 0.02,
    sway: { tilt: 0.5, maxAngle: 0.45 },
  };

  /**
   * Match + advance. When a full front row is 3-of-a-kind it plays in phases:
   * (1) the OUTER items (slots 0 + 2) slide to the CENTRE slot (with a slight
   * `liftY` rise) over `convergeSeconds`; (2) all three shrink to `endScale` over
   * `shrinkSeconds`; (3) a `flash` bursts outward from the centre. Then the front
   * layer is removed and the layer behind slides FORWARD over `advanceSeconds`
   * (growing + brightening) — becoming the new draggable/sortable row.
   */
  public readonly match: {
    /** How far the converging items rise during phase 1 (world units). */
    liftY: number;
    /** Phase 1: scale-up multiplier while items converge to the centre (1 = no
     * grow, 1.3 = grow 30%). They then shrink from here in phase 2. */
    convergeScale: number;
    /** Final scale multiplier as they shrink before vanishing (0 = to nothing). */
    endScale: number;
    /** Phase 1a RISE: the items lift straight up IN PLACE (still in their slots,
     * no overlap yet) while rotating to their target arc angle — duration (s). */
    riseSeconds: number;
    /** Phase-1a arc: degrees the OUTER items tilt (roll about Z) as they rise —
     * the left one one way, the right the mirror, the centre stays upright — so the
     * risen row fans into an arc (see the reference). 0 = no tilt. */
    arcTiltDeg: number;
    /** During the match, nudge the CENTRE item this far toward the camera (+Z,
     * world units) so it renders IN FRONT of the outer two as they converge onto
     * it. 0 = no nudge. */
    centerFrontZ: number;
    /** Extra rise for the CENTRE item on top of `liftY` (world units) so it sits
     * higher than the outer two. 0 = same height as the others. */
    centerExtraLiftY: number;
    /** Phase 1b: after the rise, outer items → centre slide duration, seconds. */
    convergeSeconds: number;
    /** Phase 2: shrink-down duration, seconds. */
    shrinkSeconds: number;
    /** Time for the layer behind to advance to the front, seconds. */
    advanceSeconds: number;
    /** Phase 3: the centre burst. `color` 0 = use the matched item's colour;
     * `maxScale` is the burst's world radius; `seconds` its expand/fade time;
     * `opacity` its starting alpha; `z` nudges it toward the camera over the items. */
    flash: {
      color: number;
      maxScale: number;
      seconds: number;
      opacity: number;
      z: number;
    };
  } = {
    liftY: 0.35,
    convergeScale: 1.15,
    endScale: 0.05,
    riseSeconds: 0.22,
    arcTiltDeg: 8,
    centerFrontZ: 0.4,
    centerExtraLiftY: 0.3,
    convergeSeconds: 0.12,
    shrinkSeconds: 0.2,
    advanceSeconds: 0.2,
    flash: {
      color: 0,
      maxScale: 0.7,
      seconds: 0.32,
      opacity: 0.7,
      z: 0.6,
    },
  };

  /** Screen enter transitions (per HUD screen id). */
  public readonly transitions: { hudEnter: ScreenTransition } = {
    hudEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 },
  };

  /** Idle → end card: if the player doesn't tap the screen for `seconds`, the end
   * card (store CTA) is shown. Any tap anywhere resets the timer. */
  public readonly idle: {
    enabled: boolean;
    seconds: number;
  } = {
    enabled: true,
    seconds: 20,
  };

  /**
   * Top-of-screen COUNTDOWN timer chip: a centred rounded pill with a thick
   * coloured border, dark inner panel, a small top tab, and MM:SS text that
   * counts down over `durationSeconds`. Placeholder vector art for now (swap for
   * a textured asset later without touching the controller). Sizes are px @
   * `referenceWidth` and scale with the play-rect; `topFraction` positions it.
   */
  public readonly countdown: {
    /** Total countdown length (seconds). */
    durationSeconds: number;
    /** Start counting immediately on load (true, for testing) vs. wait for the
     * gameplay `start` event (false). */
    autoStart: boolean;
    /** Chip CENTRE Y as a fraction of the SCREEN height (0 = top edge) — pinned to
     * the screen top, so it doesn't drift with the play-rect's letterbox margin. */
    topFraction: number;
    /** Chip size (px @ referenceWidth). */
    width: number;
    height: number;
    /** Corner radius + border thickness (px @ referenceWidth). */
    radius: number;
    borderWidth: number;
    /** MM:SS font size (px @ referenceWidth). */
    fontSize: number;
    /** Progress-ring colour (the border DEPLETES around the pill's perimeter as
     * time runs out), and the colour it + the text turn once time is LOW. */
    borderColor: number;
    lowColor: number;
    /** The empty (already-elapsed) part of the ring — a faint groove behind it. */
    trackColor: number;
    trackAlpha: number;
    /** Inner panel + text colour. */
    innerColor: number;
    textColor: number;
    /** Remaining-fraction (0..1) at/below which it turns `lowColor`. */
    lowThreshold: number;
    /** Draw the little accent tab centred on the top edge (the ring's start). */
    showTab: boolean;
    /** Banner shown when time runs out + its font size (px @ referenceWidth). */
    timeoutText: string;
    timeoutFontSize: number;
    /** Banner shown when the board is fully cleared (win) + its colour. */
    winText: string;
    winColor: number;
  } = {
    durationSeconds: 180,
    autoStart: true,
    topFraction: 0.05,
    width: 150,
    height: 54,
    radius: 24,
    borderWidth: 7,
    fontSize: 30,
    borderColor: 0x3fd155,
    lowColor: 0xff4d4d,
    trackColor: 0x0c1526,
    trackAlpha: 0.5,
    innerColor: 0x1a2a5e,
    textColor: 0xffffff,
    lowThreshold: 0.15,
    showTab: false,
    timeoutText: "Time's Up!",
    timeoutFontSize: 88,
    winText: "You Win!",
    winColor: 0x3fd155,
  };

  /**
   * BROOM booster: a round button near the bottom of the screen. Tapping it
   * "vacuums" 3 identical on-screen (front-layer) items toward a world point
   * (near the button), each turning so its BOTTOM faces the broom as it flies
   * in, then shrinking away. Placeholder vector art for now (icon later); a
   * trail is added later too.
   */
  public readonly booster: {
    broom: {
      /** Button CENTRE as fractions of the SCREEN (0..1). */
      bottomFraction: number;
      centerFraction: number;
      /** Button radius (px @ referenceWidth). */
      radius: number;
      /** Extra size multiplier on top of `radius` (1 = just radius). */
      scale: number;
      /** Placeholder colours (swap for art later). */
      color: number;
      iconColor: number;
    };
    /** Remaining-uses COUNT badge: a red circle at the button's lower edge with the
     * count inside. `count` is THE KNOB (how many broom uses are left). */
    count: {
      count: number;
      /** Badge radius + centre offset from the button centre, as fractions of the
       * button radius (+x right, +y down). */
      radiusFraction: number;
      offsetXFraction: number;
      offsetYFraction: number;
      /** Badge fill + text colour, and count font size as a fraction of button radius. */
      color: number;
      textColor: number;
      fontFraction: number;
    };
    suck: {
      /** World point the items fly INTO (view-local == world). Keep it below the
       * board, toward the camera, roughly under the button. */
      target: { x: number; y: number; z: number };
      /** PHASE 1 (in place): how far each item lifts up (world units) + its
       * duration (seconds), while it smoothly turns its BOTTOM toward the button. */
      liftY: number;
      liftSeconds: number;
      /** PHASE 2: fly duration per item (seconds) + delay between the 3 (seconds). */
      seconds: number;
      stagger: number;
    };
    /** SHUFFLE booster (the purple magic-hat button, row slot 1): re-scatters ALL
     * items (back layers included) across their same occupied slots. `count` is
     * how many shuffle uses are left (badge, same style as the broom's). */
    shuffle: {
      color: number;
      iconColor: number;
      count: number;
    };
    /** Shuffle ANIMATION choreography. On tap: the hat button slides to the board
     * centre; every item pops STRAIGHT forward (out through its open cell front, so
     * it never clips a wall) to `forwardZ`, then gathers at `gather`; (spin lands
     * here later); then they fly back FAST to their new shuffled slots. */
    shuffleAnim: {
      /** World point the items gather at (the hat), in front of the board. */
      gather: { x: number; y: number; z: number };
      /** How long the hat takes to slide to the centre (s). The items start
       * moving AT THE SAME TIME (this is just the hat's travel time, not a delay). */
      hatInSeconds: number;
      /** Z-plane just in front of the cabinet the items pop to first (clears walls). */
      forwardZ: number;
      /** Straight-forward pop duration (s). */
      forwardSeconds: number;
      /** Random spread (s) added to each item's pop start, so they don't pop in
       * lockstep — the forward pull looks independent. After popping, an item hands
       * off to the physics swirl (which also pulls it inward = the gather). */
      popStagger: number;
      /** The SPIN is a lightweight PHYSICS sim: items swirl inside a circular area
       * around the hat, each drifting independently (wind-in-a-fan feel) — a
       * tangential swirl force circulates them, a radial spring keeps them within
       * the [radiusMin, radiusMax] band, and per-item turbulence adds natural
       * wander; some also spin on their own axis. Integrated per frame in update(). */
      spin: {
        /** FREE-swirl duration (s) — items just wind around the hat at their radius. */
        seconds: number;
        /** After the free swirl, the hat SUCKS them in: over this long (s) they're
         * pulled to the centre while scaling down (as if swallowed), then placed. */
        pullInSeconds: number;
        /** Scale multiplier the items shrink to as they're sucked in (0 = vanish). */
        swallowScale: number;
        /** Circular area the items stay within (world units) — each has its own
         * preferred radius in this band. */
        radiusMin: number;
        radiusMax: number;
        /** Radius they're pulled IN to at the end of the suck (0 = the very centre). */
        endRadius: number;
        /** Tangential swirl acceleration (how hard they circulate). */
        swirl: number;
        /** Radial spring stiffness pulling each item toward its preferred radius. */
        spring: number;
        /** Random per-item drift acceleration (the "wind"). */
        turbulence: number;
        /** Fraction of velocity kept per second (0..1) — lower = more drag. */
        damping: number;
        /** Initial tangential speed given at the start of the swirl. */
        initialSpeed: number;
        /** Own-axis spin speed range (rad/s); a fraction `selfSpinChance` of items
         * get one (random sign → can turn a full 360° either way). */
        selfSpinChance: number;
        selfSpinSpeedMin: number;
        selfSpinSpeedMax: number;
      };
      /** The hat SQUASHES down while it sucks the items in (over `spin.pullInSeconds`,
       * synced), then POPS up over `upSeconds` as they're distributed back out. */
      burst: {
        downScale: number;
        upScale: number;
        upSeconds: number;
      };
      /** FASTER return to the new slots (s). */
      scatterSeconds: number;
    };
    /** Extra placeholder booster buttons laid in a row NEXT TO the broom + shuffle
     * — empty (no function) for now, just coloured round buttons. */
    placeholders: {
      count: number;
      color: number;
      /** Gap between adjacent buttons, as a fraction of the button radius. */
      gapFraction: number;
    };
    /** Comet trail streaked behind each flying item (billboarded triangle). */
    trail: {
      enabled: boolean;
      /** Width at the head + tail tip fraction (0..1) + opacity. */
      width: number;
      tipWidth: number;
      opacity: number;
      /** Trail length in sampled points, and how long the tail dissolves after
       * the item lands (seconds). */
      points: number;
      fade: number;
      /** null = use the flying item's own colour; else this fixed colour. */
      color: number | null;
    };
  } = {
    broom: {
      bottomFraction: 0.96,
      centerFraction: 0.5,
      radius: 42,
      scale: 0.65,
      color: 0x6b4b2a,
      iconColor: 0xffd23f,
    },
    count: {
      count: 3,
      radiusFraction: 0.42,
      offsetXFraction: 0.62,
      offsetYFraction: 0.7,
      color: 0xe23b3b,
      textColor: 0xffffff,
      fontFraction: 0.6,
    },
    shuffle: {
      color: 0x8b3fd1,
      iconColor: 0xffd23f,
      count: 3,
    },
    shuffleAnim: {
      gather: { x: 0, y: 0, z: 6 },
      hatInSeconds: 0.35,
      forwardZ: 3,
      forwardSeconds: 0.3,
      popStagger: 0.25,
      spin: {
        seconds: 0.8,
        pullInSeconds: 0.55,
        swallowScale: 0.05,
        radiusMin: 0.2,
        radiusMax: 1.2,
        endRadius: 0,
        swirl: 55,
        spring: 26,
        turbulence: 11,
        damping: 0.12,
        initialSpeed: 7,
        selfSpinChance: 1,
        selfSpinSpeedMin: 4,
        selfSpinSpeedMax: 9,
      },
      burst: {
        downScale: 0.6,
        upScale: 1.9,
        upSeconds: 0.16,
      },
      scatterSeconds: 0.28,
    },
    placeholders: {
      count: 2,
      color: 0x2f6fb0,
      gapFraction: 0.55,
    },
    suck: {
      target: { x: 0, y: -9, z: 4 },
      liftY: 0.5,
      liftSeconds: 0.25,
      seconds: 0.45,
      stagger: 0.08,
    },
    trail: {
      enabled: true,
      width: 0.7,
      tipWidth: 0.05,
      opacity: 0.7,
      points: 8,
      fade: 0.2,
      color: null,
    },
  };

  /**
   * END CARD (CTA): shown after the game ends (win or time-out) over a scrim on
   * the still-visible board — a placeholder rounded-square icon, the game name,
   * and a pulsing "İNDİR" button. Tapping the button OR anywhere on the card opens
   * the platform store (iOS App Store on iPhone/desktop, Google Play on Android —
   * the iOS build is delivered separately but the same runtime picks the link).
   * Real art replaces the placeholder icon later.
   */
  public readonly end: {
    /** Px width the fonts/sizes are designed for (scaled by the play-rect). */
    referenceWidth: number;
    /** Scrim over the board (kept light so the won board stays visible). */
    scrimColor: number;
    scrimAlpha: number;
    /** Placeholder app-icon (rounded square): colour, width (fraction of play
     * width), vertical centre (fraction of play height), corner rounding. */
    iconColor: number;
    iconWidthFraction: number;
    iconCenterYFraction: number;
    iconCornerFraction: number;
    /** Game name under the icon. */
    gameName: string;
    gameNameColor: number;
    gameNameStrokeColor: number;
    gameNameFontSize: number;
    gameNameCenterYFraction: number;
    /** "İNDİR" button: label, pill fill, size + position, pulse. */
    downloadText: string;
    downloadFill: number;
    downloadTextColor: number;
    downloadFontSize: number;
    downloadWidthFraction: number;
    downloadHeightFraction: number;
    downloadCenterYFraction: number;
    downloadCornerFraction: number;
    pulseScale: number;
    pulseSeconds: number;
    /** Entrance: delay before the card fades in (s) + the fade duration. */
    fadeDelaySeconds: number;
    fadeSeconds: number;
    /** Store URLs: iOS App Store (+ desktop fallback) / Google Play. */
    storeUrl: string;
    storeUrlAndroid: string;
  } = {
    referenceWidth: 480,
    scrimColor: 0x0a1834,
    scrimAlpha: 0.92,
    iconColor: 0x3861b2,
    iconWidthFraction: 0.42,
    iconCenterYFraction: 0.32,
    iconCornerFraction: 0.22,
    gameName: "Sort Express!",
    gameNameColor: 0xffffff,
    gameNameStrokeColor: 0x12234a,
    gameNameFontSize: 40,
    gameNameCenterYFraction: 0.54,
    downloadText: "İNDİR",
    downloadFill: 0x3fd155,
    downloadTextColor: 0xffffff,
    downloadFontSize: 34,
    downloadWidthFraction: 0.62,
    downloadHeightFraction: 0.09,
    downloadCenterYFraction: 0.72,
    downloadCornerFraction: 0.5,
    pulseScale: 1.08,
    pulseSeconds: 0.6,
    fadeDelaySeconds: 0.8,
    fadeSeconds: 0.4,
    storeUrl: "https://apps.apple.com/tr/app/sort-express/id6739867121?l=tr",
    storeUrlAndroid: "https://play.google.com/store/apps/details?id=com.CircleGames.SortExpress&hl=tr",
  };
}
