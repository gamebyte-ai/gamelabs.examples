import { SCREEN_TRANSITION_TYPES, type ScreenTransition, type ViewportConfig } from "@gamebyte/gamelabsjs";
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

  /** Letterbox / pillarbox fit for the whole render surface. The viewport fills
   * the mount while its aspect stays within [minAspect, maxAspect]; outside that
   * band it's contained (black bars). */
  public readonly viewport: ViewportConfig = {
    fit: "contain",
    minAspect: 9 / 23, // tallest/narrowest portrait phones fill (no bars)
    maxAspect: 3 / 4, // wider than this → black bars (lower it = black sooner)
    background: "#000000",
  };

  /** Inner play column the HUD lays its UI out within: edge-attached components
   * stick to THIS rect's edges, not the viewport's. Width is
   * min(viewportWidth, viewportHeight * maxAspect), centred; the gap to the
   * viewport edges shows the scene background. `refWidth` is the design width at
   * which the HUD's px sizes are authored — the whole HUD scales by
   * gameWidth / refWidth, so every element shrinks/grows with the screen. */
  public readonly gameScreen = { maxAspect: 0.5, refWidth: 440 };

  /** Static bin the shapes pile up in. `transparent` hides the floor + glass
   * walls so the pile floats on the background (the colliders are unaffected). */
  public readonly bin = {
    halfWidth: 1.6, // play-area half-extent in x (pool width = halfWidth * 2)
    halfDepth: 1.6, // play-area half-extent in z (pool depth = halfDepth * 2)
    floorY: 0, // top surface of the floor
    floorColor: 0x2b313b,
    wallHeight: 35.0, // visible glass-wall height
    wallColliderHeight: 19.0, // collider extends higher than the glass so shapes can't bounce out
    wallThickness: 0.5,
    wallColor: 0x3b4250,
    transparent: true, // skip the bin's visual mesh (colliders stay) — pile sits on the background
    lidHeight: 6, // a ceiling collider closes the pool this high above the floor once play starts (keeps booster-flung items in)
    wallFriction: 0.15, // friction of ALL bin colliders (floor + walls + lid) against the items — lower = items slide more
    wallRestitution: 0, // bounciness [0,1] of those colliders — higher = items bounce off the walls/floor more
  };

  /** 3D slot rack in front of the bin where collected shapes fly to and line up.
   * `itemScale` is the collected shape's size relative to its pile size.
   * `itemRotationY` (degrees) gives the seated shape a slight diagonal turn.
   * `tiltX` (degrees) is the shared X-tilt (pitch toward the camera) applied to
   * BOTH the pads and the seated items, so an item always sits flush on its pad. */
  public readonly rack = {
    z: 2.35,
    y: 2.32,
    itemScale: 0.6,
    itemRotationY: 25,
    tiltX: -32, // counter-rotated for the lowered camera (was -40 at the ~top-down angle); keeps the tray's apparent tilt the same — re-tune alongside camera.position.z
    itemLift: 0.15, // raises the seated item so its base rests on the pad (anchor is its center, not its base)
    arcLift: 1.5, // collected item hops this high (world units) above its start/end before landing in the tray
    shiftHop: 1.8, // how high a seated item hops while sliding to a new slot on reorder (world units)
    suspensionDip: 0.7, // how far the pad + landed item sink on impact before springing back (world units)
    matchLift: 1.8, // how high a matched shape rises off the rack before collapsing (world units)
    matchGrow: 1.5, // peak scale of a matched shape during the rise, as a multiple of itemScale
    // Tray sizing (world units). Slot pitch = padWidth + gap; the full row spans
    // (capacity-1)*(padWidth+gap) + padWidth, which must fit the portrait width
    // (ortho width ≈ camera.zoom frustum height * viewport-aspect, ~3.3–4.0 in portrait).
    padWidth: 0.39, // block width in x
    gap: 0.06, // empty space between adjacent blocks
    padDepth: 0.4, // pad size in z (world units)
    padColor: 0x222831,
    dangerColor: 0x830000, // the last (rightmost) pad blinks this when only one tray slot is left
    dangerBlink: 0.4, // half-period of that warning blink (seconds)
    show: true, // false hides the tray rack + skips the fly-to-tray (picks just clear the item) — test toggle
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

  /** Triangular trail behind a collected item as it flies to the tray. `points`
   * is the trail LENGTH (how many recent positions it spans — bigger = longer
   * tail); `width` is the world-space base thickness AT THE ITEM (the two corners
   * straddling it), tapering to `tipWidth × width` at the tail tip — so `tipWidth`
   * 0 is a sharp triangle, 1 a uniform ribbon. `color`/`opacity` its look. After
   * the item lands, the tail catches up to the head over `fade` seconds, so it
   * vanishes from its origin toward the item (not a whole-strip fade). */
  public readonly trail = { enabled: true, color: 0xffffff, width: 0.1, tipWidth: 0, points: 6, opacity: 0.8, fade: 0.1 };

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
    size: { dice: 0.3, billardball: 0.35, guitar: 0.9, radio: 0.5, gascan: 0.5 },
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
    dice: 54,
    billardball: 54,
    guitar: 69,
    radio: 54,
    gascan: 75,
  };
  /** Initial drop placement. Items are laid out on a loose 3D grid that fills the
   * bin (so they spawn together as a compact cloud, not a tall column): `cell` is
   * the x/z grid spacing (keep ≥ item size to avoid overlap), `layerGap` the
   * vertical gap between stacked layers, `baseY` the lowest layer, and `jitter` a
   * small random offset per axis for a natural look. Total drop height stays low —
   * a handful of layers regardless of item count. */
  public readonly spawn = {
    cell: 0.4,
    layerGap: 0.3,
    baseY: 3.5,
    jitter: 0.5,
    // Each item spawns rotated by a RANDOM multiple of `spinStepDegrees` about the
    // `spinAxis`, so identical models (e.g. guitars) don't all line up the same
    // way. 90° → one of 0/90/180/270. Set spinStepDegrees to 0 to disable. The box
    // colliders are symmetric, so this only changes how the items look.
    spinAxis: "x" as "x" | "y" | "z",
    spinStepDegrees: 90,
  };

  /** World physics (applied to ALL contacts via the engine's default contact
   * material, so it governs item↔item piling, not just item↔floor). `gravity` is
   * the y acceleration (m/s², more negative = faster fall) for the opening drop;
   * `gravityAfterStart` replaces it once play begins (applied as a per-body
   * correction force, since the world gravity is fixed at creation);
   * `restitution` is the bounce [0,1]; `friction` resists sliding. */
  public readonly physics = {
    gravity: -8.82,
    gravityAfterStart: -6.82,
    restitution: 0,
    friction: 0.06,
    // The pile is simulated in short per-body bursts, then those bodies sleep, so
    // idle items don't jitter. `settleSeconds` is the wake window after a pick;
    // `initialSettleSeconds` is the longer window after a (re)build so the first
    // drop has time to come to rest before sleeping.
    settleSeconds: 0.5,
    initialSettleSeconds: 4,
    // Hard cap on how fast any awake item may move (world units/sec). Squeezes +
    // collisions (especially the initial drop into a packed bin) can otherwise
    // fling items at huge speeds; each frame an over-speed body's velocity is
    // scaled back to this. 0 = no cap. Normal free-fall here is ~9, so keep it a
    // bit above that.
    maxSpeed: 11,
  };

  /** A pick wakes only the items a vertical CYLINDER touches — a column standing on
   * the picked item's (x,z), `radius` wide and `height` tall (from the floor up),
   * so the stack above the gap falls in while everything outside stays asleep (and
   * can't jitter). Distance is horizontal only; vertical span is floor → floor+height.
   * `max` caps how many (nearest first) wake — 0 = no cap. When `show` is on, a
   * translucent cylinder is drawn at the pick for `fadeSeconds` so the wake volume
   * is visible (a tuning aid); `color`/`opacity` style it. */
  public readonly pickWake = {
    radius: 0.33,
    height: 7,
    max: 0,
    show: false,
    color: 0x49d1ff,
    opacity: 0.28,
    fadeSeconds: 0.4,
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

  /** Slot tray: collect identical shapes; matchCount of a kind clears + scores.
   * `collectPoints` is scored per pick (every item taken into the tray);
   * `matchPoints` is scored on each 3-of-a-kind clear. */
  public readonly slots = { capacity: 7, matchCount: 3, collectPoints: 10, matchPoints: 30, cashPerMatch: 0.37 };
  // cashPerMatch: $ earned on each 3-of-a-kind match (× the current combo multiplier).

  /** Combo multiplier ring around the multiplier badge. Each match adds `step` to
   * the ring's fill (fraction of a full lap); the fill drains continuously at
   * `decayPerSecond`. Every full lap bumps the level (x1 → x2 → x3 …), wraps the
   * ring back to empty in the next palette colour, and multiplies match points by
   * the new level. When the ring drains a full lap it drops a level; at x1 it
   * empties out and the combo ends. `palette` cycles per level (level N uses
   * palette[(N-1) % len]). `ringRadius`/`ringWidth`/`startAngle` are design px /
   * degrees (the ring is drawn inside the badge, which scales with the screen). */
  public readonly combo = {
    step: 0.78, // fill added per match (1 = a whole lap in one match)
    decayPerSecond: 0.22, // fill drained per second while a combo is live
    ringRadius: 34, // ring radius around the badge (design px @ refWidth)
    ringWidth: 6, // ring stroke thickness (design px)
    startAngle: 90, // 6 o'clock (bottom); the fill sweeps clockwise from here
    trackColor: 0x1c2430, // faint full-circle track behind the fill
    trackAlpha: 0.55,
    palette: [0x49d17a, 0x3fa9f5, 0xb061f0, 0xff9f43, 0xff5b5b], // per-level colour cycle
  };

  /** Per-booster charge ring. Each match fills BOTH boosters by one; a booster
   * becomes usable once it reaches its own `matchCount` (no decay, no timer — the
   * charge only ever goes up, then resets to 0 when the booster is used). The ring
   * around each icon shows charge/matchCount in the booster's colour; the icon
   * swaps to its active art once full (passive while charging). `ringRadiusScale`
   * is the radius as a fraction of the booster's on-screen design height (tracks
   * `hud.boosterScale`). `ringOffsetY` nudges the ring vertically in design px to
   * centre it on the icon's visible circle (the art's circle sits high in its
   * texture, above the drop shadow — negative = up; tune this to taste). */
  public readonly boosters = {
    startCharged: false, // when true, both boosters are fully charged (owned + usable) at game start (test/debug); false = charge via matches
    fanMatchCount: 7, // matches to charge the fan booster
    springMatchCount: 5, // matches to charge the spring booster
    fanColor: 0xc82fff,
    springColor: 0x2cb8ff,
    ringRadiusScale: 0.43, // ring radius as a fraction of the booster design height
    ringOffsetY: -2, // vertical position nudge of the ring (design px; negative = up)
    activeIconOffsetY: -2, // vertical nudge of the ACTIVE icon art only (design px; negative = up) — corrects active art that sits lower in its frame than the passive
    ringWidth: 8,
    startAngle: -90, // 12 o'clock; fills clockwise
    trackColor: 0x1c2430,
    trackAlpha: 0.55,
    promptPulseScale: 1.3, // spring icon pops to this × its size when a full tray is rescued (use-me prompt)
    promptPulseDuration: 0.76, // half-duration of that pop (up, then back) in seconds
  };

  /** Minimum delay between picks (seconds): after collecting an item, further
   * picks are ignored until this elapses (prevents rapid multi-collect). */
  public readonly pickCooldown = 0.09;

  /** Fan booster: tapping it spins the WHOLE pool into a tornado. Rather than
   * pushing with forces (which a packed pile resists), the fan DIRECTLY drives each
   * item's velocity along a spiral field each frame, so every object — top, bottom,
   * corners — orbits reliably. The field = rigid rotation about the pool centre at
   * `angularSpeed` (rad/s; same rate for all → a coherent spiral), plus an inward
   * drift (`inwardSpeed`, m/s, tightens the column) and an upward drift
   * (`riseSpeed`, m/s, lifts the tornado). `direction` (+1/-1) flips the spin.
   * `duration` is how long it spins; `ramp` (s) eases the spiral in/out; friction
   * drops to `friction` while spinning so items slide freely; `settleAfter` keeps
   * physics running afterwards so the pile drops back and resettles. */
  public readonly fan = {
    duration: 4,
    settleAfter: 2.8,
    angularSpeed: 7, // tornado spin rate (rad/s) about the pool centre — all items share it, so the whole pool turns together
    inwardSpeed: 1.5, // m/s drift toward the centre axis OUTSIDE the core (gathers items so they don't hug the walls)
    coreRadius: 0.7, // radius of the hollow centre — items inside it are pushed OUTWARD (like the dip when you stir a cup), so the middle empties instead of a stuck item sitting on the axis
    outwardSpeed: 3, // m/s push out of the core (strongest at the axis, fading to 0 at coreRadius)
    riseSpeed: 0.7, // m/s upward drift while spinning (the tornado lifts items; capped by the lid)
    direction: -1, // 1 = clockwise (top-down), -1 = counter-clockwise
    ramp: 0.4, // seconds to ease the spiral in at the start and out at the end
    friction: 0.1, // item↔item friction while spinning (slippery so they swirl freely); restored after
    velocityBlend: 0.6, // how hard the spiral overrides physics each frame [0–1]: lower keeps more collision-separation (items don't interpenetrate, so no burst when the fan ends), higher = crisper spin. ~0.3–0.5 is smooth.
  };

  /** Spring booster: tapping it flings the last collected item from the tray back
   * into the pool. The tray block first JUMPS straight up out of the tray (the
   * first `jumpRatio` of `flyTime`, springing to `arcLift` world units above its
   * start), then arcs over the walls to a release point inside the pool —
   * `spawnHeight` above the floor, within `scatter` of the centre. There a pile
   * body spawns and is THROWN in: launched hard downward at `throwSpeed` with a
   * random horizontal `throwKick` so it tumbles into the pile rather than being
   * set down. Physics stays on for `settle` seconds so it crashes in and the pile
   * resettles. */
  public readonly spring = {
    spawnHeight: 4.5,
    throwSpeed: 6,
    throwKick: 2,
    scatter: 2,
    settle: 1.5,
    flyTime: 0.45,
    arcLift: 2.5,
    jumpRatio: 0.4, // fraction of flyTime the block springs STRAIGHT UP before it travels to the pool (0 = no jump, just a flat arc)
    padJump: 0.6, // how high the vacated tray pad springs UP (world units) as it launches the block — the catapult recoil
    padJumpTime: 0.18, // duration of the pad's spring up (and, symmetrically, its settle back) in seconds
    pickLock: 0.7, // seconds the returned item can't be re-picked after it spawns, so it must drop into the pool before it's clickable again
  };

  /** Countdown clock shown top-centre. `startSeconds` is the time the player has;
   * when it reaches zero the game is lost. Displayed as mm:ss. */
  public readonly time = { startSeconds: 120 };

  /** HUD goal chips (3, shown below the timer). `kind` picks the model shown,
   * `target` is the displayed count. Placeholder wiring — goal art + completion
   * rules come later; for now they render their bg + count text. */
  public readonly goals: { kind: Kind; target: number }[] = [
    { kind: "dice", target: 18 },
    { kind: "radio", target: 18 },
    { kind: "billardball", target: 18 },
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
    goalDoneTick: "✓", // shown in place of the count once a goal is fully collected
    goalDoneTickColor: 0x4cd964, // green tick colour
    goalDoneBgTint: 0x5e6b7a, // a completed goal's bg + item icon are tinted to this muted colour (full opacity)
    boosterScale: 0.18, // bottom booster icon height as a fraction of the game-screen width (scales with screen size)
    bannerScale: 0.82, // end-of-game banner width as a fraction of the game-screen width (scales with screen size)
    cashColor: 0x15eb4e, // colour of the CASH "$N" text
    cashPulseScale: 1.25, // peak scale of the cash pill's pop on each increase
    cashPulseDuration: 0.12, // half-duration of that pop (up, then back) in seconds
    timerWarnSeconds: 10, // the timer turns red + blinks once this many seconds remain
    timerWarnColor: 0xff5b5b, // timer text colour while in the warning window
    timerBlink: 0.3, // half-period of the timer warning blink (seconds)
  };

  /** Fixed 3D camera looking down into the bin.
   * `orthographic` swaps the perspective camera for an isometric-style parallel
   * projection (no perspective convergence). The vertical world-space extent the
   * camera shows (its frustum height — smaller = more zoomed in) is responsive:
   * it's chosen from the viewport aspect (width / height) via `zoom`, while the
   * frustum width always follows the true aspect so nothing is stretched.
   *
   * `zoom`: between `minAspect` (narrow) and `maxAspect` (wide) the frustum height
   * lerps from `frustumAtMin` to `frustumAtMax` — a small zoom that keeps the pool
   * + tray framed at the screen edges across phone shapes. Outside the band it's
   * pinned: wider than `maxAspect` stays at `frustumAtMax`, narrower than
   * `minAspect` stays at `frustumAtMin`. Narrow screens want a TALLER frustum to
   * fit the pool width, so `frustumAtMin` is usually larger than `frustumAtMax`. */
  public readonly camera = {
    // Lowered toward the front (bigger z than the ~straight-down original) so the
    // pile is viewed at a shallower angle — front items overlap the back ones and
    // hide the floor gaps. Raising z tilts further; the tray's `rack.tiltX` is
    // counter-rotated by the same amount so the tray's look is unchanged.
    position: { x: 0, y: 98.6, z: 3.3 },
    lookAt: { x: 0, y: 0.85, z: 0.1 },
    orthographic: true,
    zoom: {
      minAspect: 0.4, // width/height at the narrow end of the band
      maxAspect: 0.5, // width/height at the wide end of the band
      frustumAtMin: 7.8, // frustum height at minAspect (narrow → zoomed out a touch)
      frustumAtMax: 6.7, // frustum height at maxAspect (wide → zoomed in a touch)
    },
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
