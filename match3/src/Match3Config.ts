import { SCREEN_TRANSITION_TYPES, type ScreenTransition, type ViewportConfig } from "@gamebyte/gamelabsjs";

/**
 * Match-3 tuning, gem palette, and screen transition.
 */
export class Match3Config {
  public static readonly GRID_ID = 1;
  /** Shared by Three.js gems and tuning (`gemTypeCount` should not exceed palette length). */
  public static readonly GEM_PALETTE: readonly number[] = [0xe11d48, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7];
  /**
   * Draw a plane under each cell. Off for the flat look; on to see the framework's
   * `GridCellObject.createVisual()` path. Static because cell objects are built without
   * DI — so `game-config.json` cannot reach it.
   */
  public static readonly SHOW_CELL_PLANES = false;
  /** Board setups; {@link level} picks one at boot. The grid is built once, from it. */
  public static readonly LEVELS: readonly { rows: number; cols: number; gemTypeCount: number; goal: number }[] = [
    { rows: 8, cols: 8, gemTypeCount: 4, goal: 60 },
    { rows: 8, cols: 8, gemTypeCount: 3, goal: 40 }
  ];

  /** 1-based. An instance field so `game-config.json` can switch it; clamped in range. */
  public readonly level = 2;

  private get _level(): { rows: number; cols: number; gemTypeCount: number; goal: number } {
    const index = Math.min(Math.max(Math.trunc(this.level), 1), Match3Config.LEVELS.length) - 1;
    return Match3Config.LEVELS[index];
  }

  /** Board shape from the active level. Getters, so they cannot drift from it. */
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
   * Gems stacked above the playable window. Real cells in the same grid, so gravity
   * draws them down on its own; refill tops the stack back up, keeping it endless.
   */
  public readonly reserveRows = 40;
  /**
   * Test aid: cap how many gems of one colour the board starts with, so a specific
   * colour is easy to hunt for. `count: -1` leaves the board alone.
   */
  public readonly debugLimitGemType = {
    gemType: 3,
    count: 7
  };
  /** Test aid: start with a stripe beside a bomb, to try their combination. */
  public readonly debugSeedBoosters = true;
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
  /**
   * Ceiling on one frame's timestep, in seconds. Everything integrated per frame — the
   * fall above all — is advanced by at most this much however long the frame actually
   * took, so a stalled loop (paused debugger, background tab, long GC) resumes where it
   * left off instead of jumping a second of gravity in a single step.
   *
   * ~3 frames at 60Hz. Raising it lets stalls through; lowering it makes a genuinely
   * slow frame run in slow motion.
   */
  public readonly maxStepSec = 0.05;
  /**
   * Global time scale. 1 is normal, 0.2 is fifth speed, 0 freezes the board. Everything
   * timed goes through it: the per-frame fall, gsap's tweens (pop, swap, bolts, waves)
   * and the sweep's own delays — so the board slows down as one piece rather than
   * drifting out of step with itself.
   *
   * NOT readonly, and the one field here meant to be written at runtime:
   * `match3.slow(0.2)` from the console (see {@link Match3App}).
   */
  public timeScale = 1;
  /** World cell size for {@link RectGridPreset} (Three.js board). */
  public readonly gridColumnSize = 0.92;
  public readonly gridRowSize = 0.92;
  /**
   * Top-down ortho framing. `ortho*` is frustum HEIGHT in world units; width follows as
   * `height × aspect`, so a bigger value zooms OUT. The height lerps across the aspect
   * band and pins outside it, keeping the board near 92% of screen width at both ends.
   */
  public readonly camera = {
    minAspect: 9 / 23, // narrow end of the band (matches viewport.minAspect)
    maxAspect: 3 / 4, // wide end — board stops growing here
    orthoAtMin: 19.4, // frustum height at minAspect (narrow → zoomed out, board smaller)
    orthoAtMax: 11 // frustum height at maxAspect (wide → zoomed in, board bigger)
  };
  /**
   * Letterbox fit. The canvases fill the mount while the aspect stays inside the band,
   * and are contained (black bars) outside it.
   *
   * Read in the `Match3App` constructor, which runs before overrides land — so
   * `game-config.json` cannot change it.
   */
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
  /** Everything outside the board. Not the letterbox bars — those are `viewport`. */
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
   * Outer board size, outline padding included. Derived so the outline, the panel and
   * the clipping planes cannot drift apart. Getters are invisible to overrides.
   */
  public get boardWidth(): number {
    return this.cols * this.gridColumnSize + this.boardOutlinePadding * 2;
  }

  public get boardDepth(): number {
    return this.rows * this.gridRowSize + this.boardOutlinePadding * 2;
  }

  /** Board size relative to level 1, which the camera band was tuned against. */
  public get cameraBoardScale(): number {
    const reference = Match3Config.LEVELS[0];
    return this.boardWidth / (reference.cols * this.gridColumnSize + this.boardOutlinePadding * 2);
  }
  /**
   * Drop shadow behind each gem: a radial gradient generated at runtime, parented to
   * the gem. Under a top-down camera the offset is what reads as height. `softness` is
   * where the fade starts (0 = from the centre, 1 = hard edge); `opacity` 0 disables it.
   */
  public readonly gemShadow = {
    opacity: 0.15,
    scale: 1,
    offsetX: 0.035,
    offsetZ: 0.045,
    softness: 0.35
  };
  /**
   * The pop climbs a step per match through a cascade, then holds. `step` is added to
   * the playback rate (pitch and speed together); `maxSteps` caps it so it never turns
   * into a chirp. Resets once the board goes quiet.
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
  /**
   * Booster 1, earned by an L/T match of `minCells`..`maxCells` gems. It appears at the
   * junction the two runs share, and the clear collapses inward toward it. Cleared, it
   * takes its 8 neighbours. Separate from {@link special} so each can be toggled alone.
   */
  public readonly booster = {
    enabled: true,
    minCells: 5,
    maxCells: 6,
    /** Mark drawn on the gem. */
    label: "B",
    labelColor: 0xffffff,
    /** Label size as a fraction of the gem quad. */
    labelScale: 0.66,
    /**
     * Neighbours that must be filled before it goes off. 0 = never waits; 8 = holds for
     * a full ring, pulsing until then. Clamped to the neighbours a cell actually has,
     * so an edge (5) or corner (3) booster still fires.
     */
    minNeighbours: 0,
    /** One pulse, in seconds: white and back. Lower is a more urgent flash. */
    blinkStepSec: 0.2,
    /**
     * Two bombs swapped: instead of one taking its ring and the other going with it,
     * they go off together over a square of this radius around the swap. 1 would be the
     * ordinary 3x3 blast; 2 is 5x5, 3 is 7x7. Clipped at the board edge rather than
     * shifted inward — a bomb in the corner takes the quarter it can reach.
     */
    pairRadius: 2,
    /** Cookie + booster: gap between the converted boosters going off, in seconds. */
    chainDelaySec: 0.18,
    /** Pause after everything turns into a booster, before the first one goes off. */
    chainStartDelaySec: 0.6
  };
  public readonly special = {
    /** Booster 1 lives in `booster`; these two are the straight-run specials. */
    stripesEnabled: true,
    /**
     * Booster 2 — the cookie, from a straight run of `minCookieRunLength`+. Swapped with
     * a gem it clears that whole colour; set off any other way it takes one gem at
     * random.
     */
    cookieEnabled: true,
    minRunLength: 4,
    /** Run length that earns a cookie instead of a stripe; anything longer is the same. */
    minCookieRunLength: 5,
    alongMatch: true,
    /** Stripe marks drawn over the gem, in gem-quad fractions. */
    stripeColor: 0xffffff,
    stripeOpacity: 0.85,
    stripeThickness: 0.13,
    stripeGap: 0.22,
    /** Seconds between steps of a sweep, so a line clears outward. 0 = all at once. */
    sweepStepSec: 0.06
  };
  /**
   * The bolt a swapped cookie throws at every gem it is about to take. The gems pop on
   * impact, so `strikeSec` delays the clear by exactly that much — it is the wind-up,
   * not decoration over the top of it. `strikeSec: 0` removes the effect entirely.
   */
  public readonly cookieBeam = {
    strikeSec: 0.14,
    /** How long the spent bolt lingers after impact. Runs after the gems are gone. */
    fadeSec: 0.12,
    color: 0x9be8ff,
    /** Bolt width in world units. Each one varies a little around this. */
    thickness: 0.06,
    opacity: 0.9,
    /** Opacity wobbles this many times on the way out — what makes it read as electric. */
    flickers: 3
  };
  /**
   * The white wave a firing stripe throws BOTH ways down its line. It carries straight
   * on past the board and off the screen rather than stopping at the edge, so it reads
   * as a shockwave rather than a lit-up row. `speedCellsPerSec: 0` disables it.
   */
  public readonly stripeWave = {
    enabled: true,
    color: 0xffffff,
    opacity: 0.85,
    /** Depth along the direction of travel, in cells. */
    lengthCells: 0.35,
    /** Width across the lane, in cells. 1 is exactly one cell wide. */
    widthCells: 1,
    /** Cells beyond the board's edge it keeps travelling before it is dropped. */
    overshootCells: 10,
    /** Only used when the sweep is instant (`special.sweepStepSec: 0`) — see below. */
    fallbackCellsPerSec: 26
  };

  /**
   * Wave speed, DERIVED from the clear rather than set on its own: the sweep pops one
   * cell every `special.sweepStepSec`, so a wave covering one cell in the same time
   * arrives exactly as each gem goes. Tuning the sweep retimes the wave with it, and
   * the two can never drift apart into a wave that outruns the pops or trails them.
   *
   * An instant sweep has no pace to follow, so it falls back to a fixed speed.
   */
  public get stripeWaveCellsPerSec(): number {
    return this.special.sweepStepSec > 0 ? 1 / this.special.sweepStepSec : this.stripeWave.fallbackCellsPerSec;
  }
  /**
   * Bomb + stripe: instead of both going off, they MERGE into a single item covering a
   * `spanCells` × `spanCells` block at the swap. The old gems under it are gone and the
   * block counts as filled — nothing falls into it or refills it while the item lives.
   *
   * Then its rows clear, all of them at once and end to end; `waveGapSec` later the item
   * pops and its columns go with it; and once that wave is done the block is released
   * and fills normally.
   *
   * `spanCells` is the mechanic, not a look: 3 means a 3x3 block, three rows and three
   * columns. Even numbers have no centre cell, so keep it odd.
   */
  public readonly giant = {
    enabled: true,
    spanCells: 3,
    /** Between the row wave and the column wave, which the item pops along with. */
    waveGapSec: 0,
    /** After the last wave, before the empty block is let go and refills. */
    endHoldSec: 0
  };
  /**
   * Pacing per COMBINATION. Every clear runs in steps and some of them throw bolts;
   * these are the two numbers that time one, and each combination owns its own pair so
   * tuning the cookie pair cannot touch the bomb pair.
   *
   * - `stepSec` — between one step of that clear and the next. What a "step" is differs
   *   per combination: a column for the cookie pair, a ring for the bomb pair, a shell
   *   of the cross for the stripe pair.
   * - `beamSec` — how long that combination's bolts take to fly. A fixed effect length:
   *   it is spent once as a lead-in and never folded into `stepSec`, so making a clear
   *   quicker does not make its bolts quicker.
   *
   * Anything NOT a combination — an ordinary match, a lone special going off — uses the
   * shared {@link special}.sweepStepSec and {@link cookieBeam}.strikeSec.
   */
  public readonly combos = {
    /** Cookie + gem: that colour goes at once, so only the bolts are really timed. */
    cookieGem: { stepSec: 0.04, beamSec: 0.18 },
    /** Cookie + cookie: the whole board, column by column from the left. */
    cookiePair: { stepSec: 0.08, beamSec: 0.3 },
    /** Bomb + bomb: one square blast, ring by ring. */
    bombPair: { stepSec: 0.05, beamSec: 0.18 },
    /** Stripe + stripe: the cross, outward from the crossing. */
    stripePair: { stepSec: 0.04, beamSec: 0.18 },
    /** Bomb + stripe: each of the merged item's two waves, rows then columns. */
    giant: { stepSec: 0.03, beamSec: 0.18 }
  };
  /**
   * The ring that marks contact on a swap — one on each of the two cells, growing and
   * fading out. Purely decoration: it is fired as the gems start trading places and
   * nothing waits for it.
   */
  public readonly swapPulse = {
    enabled: true,
    color: 0xffffff,
    /** Opacity it starts at. It fades to nothing over `sec`. */
    opacity: 0.55,
    /** Diameter at the start and at the end, in cells. */
    fromCells: 0.45,
    toCells: 1.5,
    sec: 0.35,
    /** Ring width as a fraction of its radius. 1 fills it in — a disc rather than a ring. */
    thickness: 0.22
  };
  /** Shake on a clear of at least `minCells`, as a timeline track. 0 disables it. */
  public readonly shake = {
    minCells: 0,
    amplitude: 0.12,
    duration: 0.22
  };
  /** Pop burst, via the framework's pooled emitter. `count: 0` disables it. */
  public readonly popParticles = {
    count: 0,
    /** Outward speed in world units per second. */
    speed: 2.2,
    /** Spark size as a fraction of a cell. */
    size: 0.16,
    /** Board-wide ceiling handed to `ParticlesBinding`. */
    budget: 600
  };
  /** Pointer travel (px) separating a swipe from a tap. */
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
  public readonly animPopSec = 0.25;
  /**
   * Easing for the pop. An `*.out` curve shrinks fastest at the start, so the gem
   * reads as reacting the instant it is matched; `*.in` would hold it at full size
   * and then snap, which looks like a delay before anything happens.
   */
  public readonly animPopEase = "power2.out";
  /**
   * Downward acceleration in cells/s². Every gem falls under the same one, so a long
   * drop picks up more speed than a short one. Higher is heavier and snappier.
   */
  public readonly fallAccelCellsPerSec2 = 12;
  /**
   * Extra cells above the column that refilled gems start from. Under constant
   * acceleration a longer drop arrives faster, so this is the knob for how briskly new
   * gems come in. It is also a floor: a gem never starts inside the airspace of one
   * already falling in that column.
   */
  public readonly spawnLiftCells = 1;
  /**
   * Landing dip: the gem goes `cells` PAST its cell and back over `sec`, at a fixed
   * size whatever the drop. Cosmetic — it counts as arrived on first touch, so matches
   * never wait for it. `cells: 0` removes it.
   */
  public readonly fallBounce = {
    cells: 0,
    sec: 0.13
  };
  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 }
  };
}
