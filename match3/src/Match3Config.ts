import { SCREEN_TRANSITION_TYPES, type ScreenTransition, type ViewportConfig } from "@gamebyte/gamelabsjs";

/**
 * Match-3 tuning, gem palette, and screen transition.
 */
export class Match3Config {
  public static readonly GRID_ID = 1;
  /** Shared by Three.js gems and tuning (`gemTypeCount` should not exceed palette length). */
  public static readonly GEM_PALETTE: readonly number[] = [0xe11d48, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7];
  /**
   * Draw a plane under each cell. Off by default for the flat board look (scene
   * backdrop + one outline around the whole grid); turn it on to see the
   * framework's `GridCellObject.createVisual()` path in action.
   *
   * Static, not an instance field, because the grid module builds cell objects
   * without DI access — which also means it canNOT come from `game-config.json`.
   */
  public static readonly SHOW_CELL_PLANES = false;
  /**
   * Level table. Each entry is a whole board setup; {@link level} picks one at boot.
   *
   * Static because the board is built once, in `GameOperations.inject()`, from whichever
   * entry is active — there is nothing to re-read afterwards.
   */
  public static readonly LEVELS: readonly { rows: number; cols: number; gemTypeCount: number; goal: number }[] = [
    { rows: 8, cols: 8, gemTypeCount: 4, goal: 60 },
    { rows: 8, cols: 6, gemTypeCount: 3, goal: 40 }
  ];

  /**
   * Which level to play, 1-based. An instance field on purpose, so it can be set from
   * `game-config.json` — switching level needs no rebuild. Out-of-range values clamp.
   */
  public readonly level = 2;

  private get _level(): { rows: number; cols: number; gemTypeCount: number; goal: number } {
    const index = Math.min(Math.max(Math.trunc(this.level), 1), Match3Config.LEVELS.length) - 1;
    return Match3Config.LEVELS[index];
  }

  /**
   * Board shape, read from the active level. Getters rather than fields so they cannot
   * drift from {@link level} — which also puts them beyond the override channel's
   * reach: change `level`, not these.
   */
  public get rows(): number {
    return this._level.rows;
  }

  public get cols(): number {
    return this._level.cols;
  }

  public get gemTypeCount(): number {
    return this._level.gemTypeCount;
  }

  /** Gems this level asks the player to clear. */
  public get goal(): number {
    return this._level.goal;
  }
  /**
   * Rows of pre-generated gems stacked ABOVE the playable window. They are real
   * cells in the same grid, so gravity pulls them down on its own — no separate
   * "spawn from nowhere" path. The level is authored at boot; as the reserve drains,
   * the ordinary refill tops it back up, which keeps it endless.
   */
  public readonly reserveRows = 40;
  /** Clip rendering to the board. Off while testing, to see the reserve stacked above. */
  public readonly clipToBoard = false;

  /** Every row the grid holds: the reserve stacked on top of the playable window. */
  public get totalRows(): number {
    return this.rows + this.reserveRows;
  }

  /** First playable row. Everything above it is reserve, hidden and unmatched. */
  public get firstVisibleRow(): number {
    return this.reserveRows;
  }

  public get lastVisibleRow(): number {
    return this.totalRows - 1;
  }
  /** World cell size for {@link RectGridPreset} (Three.js board). */
  public readonly gridColumnSize = 0.92;
  public readonly gridRowSize = 0.92;
  /**
   * Top-down ortho framing. `ortho*` is the frustum HEIGHT in world units — the
   * visible vertical extent; the visible width is always `height × aspect`, so a
   * bigger value zooms OUT (board looks smaller). The board is ~7.6 wide with its
   * outline.
   *
   * The height lerps with the viewport aspect and is pinned outside the band: at
   * `minAspect` (narrowest screen) it sits at `orthoAtMin` so the board shrinks
   * and stays inside the side edges; as the screen widens the board scales up
   * until `maxAspect`, past which it holds at `orthoAtMax`.
   *
   * Defaults keep the board at ~92% of the screen width at BOTH ends of the band
   * (7.6 / 0.92 ÷ aspect), which is what makes it read as edge-pinned.
   */
  public readonly camera = {
    minAspect: 9 / 23, // narrow end of the band (matches viewport.minAspect)
    maxAspect: 3 / 4, // wide end — board stops growing here
    orthoAtMin: 19.4, // frustum height at minAspect (narrow → zoomed out, board smaller)
    orthoAtMax: 11 // frustum height at maxAspect (wide → zoomed in, board bigger)
  };
  /** Letterbox / pillarbox fit for the whole render surface. The viewport fills
   * the mount while its aspect stays within [minAspect, maxAspect]; outside that
   * band it's contained (black bars).
   *
   * NOTE: read once in the `Match3App` constructor, which runs before runtime
   * overrides land — so this one canNOT be changed from `game-config.json`. */
  public readonly viewport: ViewportConfig = {
    fit: "contain",
    minAspect: 9 / 23, // tallest/narrowest portrait phones fill (no bars)
    // Widened to allow LANDSCAPE: without this the render surface (both World +
    // HUD canvas) is letterboxed to a portrait strip, so a rotated / wide window
    // never reaches a landscape aspect. 2.2 covers phones rotated to 16:9…21:9;
    // beyond that it letterboxes.
    maxAspect: 2.2,
    background: "#000000"
  };
  /**
   * Scene backdrop — everything outside the board. Distinct from both the letterbox
   * bars (those take the mount colour, see {@link viewport}) and the board's own
   * panel below.
   */
  public readonly backgroundColor = 0xdae7f1;
  /** The grid's own panel, filling the board under the gems. */
  public readonly boardBackgroundColor = 0x6b8fb5;
  /** 1 = solid, 0 = no panel drawn at all (the scene backdrop shows through). */
  public readonly boardBackgroundOpacity = 1;
  /** Outline framing the whole grid. Individual cells are not drawn. */
  public readonly boardOutlineColor = 0xffffff;
  /** Outline stroke width in world units. */
  public readonly boardOutlineThickness = 0.09;
  /** Gap between the outermost cells and the outline. */
  public readonly boardOutlinePadding = 0.12;

  /**
   * Outer board size in world units, outline padding included. Derived rather than
   * stored so it cannot drift from the fields it is built from — the outline mesh,
   * the backdrop panel, and the render clipping planes all measure from here.
   *
   * A getter also keeps it out of `game-config.json`'s reach: overrides only touch
   * own properties, and these live on the prototype.
   */
  public get boardWidth(): number {
    return this.cols * this.gridColumnSize + this.boardOutlinePadding * 2;
  }

  public get boardDepth(): number {
    return this.rows * this.gridRowSize + this.boardOutlinePadding * 2;
  }

  /**
   * This level's board size relative to the one the camera band was tuned against
   * (level 1). The framing multiplies by it, so a 6x6 board fills the screen the way
   * an 8x8 does instead of sitting small in the middle of it.
   */
  public get cameraBoardScale(): number {
    const reference = Match3Config.LEVELS[0];
    return this.boardWidth / (reference.cols * this.gridColumnSize + this.boardOutlinePadding * 2);
  }
  /**
   * Soft drop shadow behind each gem, to give the flat quads some depth. Drawn as a
   * radial black gradient generated at runtime (no asset), parented to the gem so it
   * scales and pops with it.
   *
   * `scale` is relative to the gem quad, `offset*` are world units in the board
   * plane — with a straight top-down camera the offset is what reads as height above
   * the board. `softness` is where the gradient starts fading (0 = fades from the
   * centre, 1 = solid disc with a hard edge). `opacity` 0 disables it entirely.
   */
  public readonly gemShadow = {
    opacity: 0.15,
    scale: 1,
    offsetX: 0.035,
    offsetZ: 0.045,
    softness: 0.35
  };
  /**
   * The pop sound climbs a step per match while a cascade keeps going, then holds at
   * the top — the classic match-3 tell that a chain is still running.
   *
   * `step` is added to the playback rate each time, which raises pitch and speed
   * together. `maxSteps` caps it: past that the pops all sound at the highest pitch
   * rather than turning into chirps. The ladder resets once the board goes quiet, so
   * every new move starts from the base note.
   */
  public readonly popPitch = {
    step: 0.08,
    maxSteps: 8
  };
  /**
   * Special gems. A run of at least `minRunLength` leaves a striped gem behind; when
   * that gem is later cleared it sweeps its whole row or column, and anything the
   * sweep catches resolves in the same pass (stripe chains included).
   *
   * `alongMatch` picks which way the stripe sweeps: `true` = the same axis the match
   * ran on (a row of four leaves a gem that clears its row), `false` = across it.
   * Two conventions exist in the genre and they feel quite different — kept as a
   * flag so it can be decided by eye rather than by assertion.
   */
  public readonly special = {
    /** Off while testing: 4- and 5-runs clear normally and leave nothing behind. */
    enabled: false,
    minRunLength: 4,
    /**
     * Run length that earns a cookie instead of a stripe. Anything from here up — 5,
     * 6, 7 — produces the same thing; the board is 8 wide, so that is the whole range.
     */
    minCookieRunLength: 5,
    alongMatch: true,
    /** Stripe marks drawn over the gem, in gem-quad fractions. */
    stripeColor: 0xffffff,
    stripeOpacity: 0.85,
    stripeThickness: 0.13,
    stripeGap: 0.22,
    /**
     * Seconds between one step of a sweep and the next. A striped gem clears outward
     * from itself: the cell beside it goes first, then the next, and so on. 0 clears
     * the whole line at once.
     */
    sweepStepSec: 0.04
  };
  /**
   * Camera shake, run as a `CameraShakeTrack` on the framework's timeline. Fires when a
   * single clear is big enough to be worth punctuating — a long sweep or a chunky
   * cascade step. `minCells: 0` disables it.
   */
  public readonly shake = {
    minCells: 0,
    amplitude: 0.12,
    duration: 0.22
  };
  /**
   * The burst a popping gem throws off, run through the framework's particle module —
   * which owns pooling and a global budget, so a heavy cascade cannot spawn unbounded
   * meshes. `count: 0` disables the effect.
   */
  public readonly popParticles = {
    count: 0,
    /** Outward speed in world units per second. */
    speed: 2.2,
    /** Spark size as a fraction of a cell. */
    size: 0.16,
    /** Board-wide ceiling handed to `ParticlesBinding`. */
    budget: 600
  };
  /**
   * Pointer travel (screen px) that separates a swipe from a tap. Below it the
   * press selects/deselects a gem; at or above it the gem swaps with its
   * neighbour in the dominant drag direction.
   */
  public readonly swipeMinDistancePx = 24;
  public readonly scorePerGem = 10;
  public readonly gemColors: readonly number[] = Match3Config.GEM_PALETTE;
  //  ANIMATION TIMING — all seconds, all live-tunable from public/game-config.json
  //
  //  A move plays out in this order:
  //
  //    swap ────────────────────► pop ─┬─► (chain resolves, next match may pop)
  //    animSwapSec                     │   animPopSec
  //                                    └─► fall + refill (together)
  //                                        fallAccelCellsPerSec2 + fallBounce
  //
  //  The drop is integrated per frame, not tweened — it has no easing curve to set.
  //
  //  `animPopSec` runs in PARALLEL with the fall — popping gems are detached from
  //  their cells, so the drop no longer waits for them. It therefore controls how
  //  long the pop is visible, not how soon the next step starts.
  //
  //  The drop is the one that gates the NEXT match in the same cells, and it is
  //  priced per cell rather than per drop, so its SPEED is what stays fixed.

  /** Gems trading places on a valid swap. */
  public readonly animSwapSec = 0.24;
  /** Bounce-and-return when a swap makes no match. Half out, half back. */
  public readonly animInvalidSwapSec = 0.3;
  /** Pop: the gem shrinks away. Overlaps the fall, so it costs no wait. */
  public readonly animPopSec = 0;
  /**
   * Easing for the pop. An `*.out` curve shrinks fastest at the start, so the gem
   * reads as reacting the instant it is matched; `*.in` would hold it at full size
   * and then snap, which looks like a delay before anything happens.
   */
  public readonly animPopEase = "power2.out";
  /**
   * Downward acceleration, in cells per second squared. Gems fall under it rather
   * than at a fixed speed: the duration works out to `sqrt(2 * distance / accel)`, so
   * a long drop picks up more speed than a short one — the same acceleration for all
   * of them, which is what reads as gravity.
   *
   * Raise it for a heavier, snappier board; lower it for a floaty one.
   */
  public readonly fallAccelCellsPerSec2 = 2;
  /**
   * The single small bounce on landing. `cells` is how far the gem rebounds, as a
   * fraction of a cell; `sec` is the whole bounce, up and back down. `cells: 0`
   * removes it.
   */
  public readonly fallBounce = {
    cells: 0,
    sec: 0.13
  };
  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 }
  };
}
