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
    { rows: 8, cols: 8, gemTypeCount: 4, goal: 40 }
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
  /**
   * Test aid: freeze the board (`timeScale = 0`) the instant a special is created with
   * an empty cell under it, and say so in the console. `match3.play()` resumes.
   */
  public readonly debugPauseOnFloatingSpecial = false;
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
   * Shared pacing for a clear that is not a combination — an ordinary match, or a lone
   * special going off. Each combination overrides it in {@link combos}.
   */
  public readonly clear = {
    /** Seconds between one step of a sweep and the next. 0 = the whole thing at once. */
    stepSec: 0.06
  };
  /**
   * BOOSTER 1 — the stripe, earned by a straight run of `minRunLength`. Cleared, it
   * sweeps its whole row or column, and whatever the sweep catches goes with it.
   *
   * `alongMatch` picks the axis: `true` = the same one the match ran on (a row of four
   * leaves a gem that clears its row), `false` = across it. Both conventions exist in
   * the genre and they feel quite different, so it is a flag rather than an assertion.
   */
  public readonly stripe = {
    enabled: false,
    minRunLength: 4,
    alongMatch: true,
    /** Stripe marks drawn over the gem, in gem-quad fractions. */
    stripeColor: 0xffffff,
    stripeOpacity: 0.85,
    stripeThickness: 0.13,
    stripeGap: 0.22,
    /**
     * The white shockwave it throws BOTH ways down its line when it fires. It carries
     * on past the board and off the screen rather than stopping at the edge, which is
     * what makes it read as a shockwave instead of a lit-up row.
     */
    wave: {
      enabled: true,
      color: 0xffffff,
      opacity: 0.85,
      /** Depth along the direction of travel, in cells. */
      lengthCells: 0.35,
      /** Width across the lane, in cells. 1 is exactly one cell wide. */
      widthCells: 1,
      /**
       * How far the middle of the wave runs AHEAD of its edges, in cells — the bow. 0 is
       * a flat bar being pushed along; higher values read as a front curving outward.
       */
      bowCells: 0.5,
      /** Cells beyond the board's edge it keeps travelling before it is dropped. */
      overshootCells: 10,
      /** Only used when the clear is instant (`clear.stepSec: 0`) — see below. */
      fallbackCellsPerSec: 26
    }
  };

  /**
   * Wave speed, DERIVED from the clear rather than set on its own: the sweep pops one
   * cell every `clear.stepSec`, so a wave covering one cell in the same time arrives
   * exactly as each gem goes. Retiming the clear retimes the wave with it, and the two
   * can never drift into a wave that outruns the pops or trails them.
   *
   * An instant clear has no pace to follow, so it falls back to a fixed speed.
   */
  public get stripeWaveCellsPerSec(): number {
    return this.clear.stepSec > 0 ? 1 / this.clear.stepSec : this.stripe.wave.fallbackCellsPerSec;
  }
  /**
   * BOOSTER 2 — the cookie, earned by a straight run of `minRunLength` or more (7 in a
   * row is the same as 5). It is colourless and cannot be matched. Swapped with a gem it
   * takes that whole colour; set off any other way it picks a colour itself.
   */
  public readonly cookie = {
    enabled: true,
    minRunLength: 5,
    /**
     * The bolt it throws at every gem it is about to take. The gems pop ON IMPACT, so
     * this is the wind-up, not decoration over the top of one. `strikeSec: 0` removes
     * the effect entirely.
     */
    beam: {
      strikeSec: 0.14,
      /** How long the spent bolt lingers after impact. Runs after the gems are gone. */
      fadeSec: 0.12,
      color: 0x9be8ff,
      /** Bolt width in world units. Each one varies a little around this. */
      thickness: 0.06,
      opacity: 0.9,
      /** Opacity wobbles this many times on the way out — what reads as electric. */
      flickers: 3
    }
  };
  /**
   * BOOSTER 3 — the bomb, earned by an L/T match of `minCells`..`maxCells` gems. It
   * appears at the junction the two runs share, and the clear collapses inward toward
   * it. Cleared, it takes its 8 neighbours.
   */
  public readonly bomb = {
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
     * a full ring, pulsing until then. Clamped to the neighbours a cell actually has, so
     * one against an edge (5) or in a corner (3) still fires.
     */
    minNeighbours: 0,
    /** How many times ONE bomb goes off before it is used up. 1 is the plain behaviour. */
    blasts: 2,
    /** Between one blast and the next. It pulses for the whole of this. */
    blastGapSec: 1.5,
    /** One pulse, in seconds: white and back. Lower is a more urgent flash. */
    blinkStepSec: 0.25,
    /**
     * How white the pulse goes, 0..1. Drawn as an additive copy of the gem masked by its
     * own texture, so it brightens the gem's shape rather than dimming it — a multiply
     * material cannot go toward white, and a plain quad would light the whole cell.
     */
    blinkStrength: 0.9,
    /** Colour the pulse fills that silhouette with. */
    blinkColor: 0xffffff
  };
  /**
   * COMBINATIONS — what two boosters do when swapped with each other, one object each.
   *
   * Every one of them clears in steps and some throw bolts, so they share two fields:
   *
   * - `stepSec` — between one step of that clear and the next. What a step IS differs:
   *   a column for the cookie pair, a ring for the bomb pair, a shell of the cross for
   *   the stripe pair.
   * - `beamSec` — how long that combination's bolts fly. A fixed effect length: spent
   *   once as a lead-in and never folded into `stepSec`, so making a clear quicker does
   *   not make its bolts quicker.
   *
   * The rest of each object is that combination's own rule.
   */
  public readonly combos = {
    /** Cookie + gem: that colour goes at once, so only the bolts are really timed. */
    cookieGem: { stepSec: 0.04, beamSec: 0.18 },
    /** Cookie + cookie: the whole board, column by column from the left. */
    /**
     * Cookie + cookie: the whole board, left to right a column at a time and top to bottom
     * within each column. `stepSec` is the beat between columns, `rowStepSec` the shorter
     * one between the cells of a column.
     */
    cookiePair: { stepSec: 0.04, beamSec: 0.1, rowStepSec: 0.01 },
    /**
     * Bomb + bomb: instead of two overlapping rings they go off together over a square
     * of `radius` around the swap. 1 is the ordinary 3x3 blast; 2 is 5x5, 3 is 7x7.
     * Clipped at the board edge rather than slid inward — a bomb in the corner takes the
     * quarter it can reach.
     */
    bombPair: { radius: 2, stepSec: 0.05, beamSec: 0.18 },
    /** Stripe + stripe: the cross through the swapped cell, outward from the crossing. */
    stripePair: { stepSec: 0.04, beamSec: 0.18 },
    /**
     * Cookie + stripe: every gem of that colour becomes a stripe, then they fire one
     * after another, each pulsing until its turn. A converted gem is off limits to
     * everything else until then, so the board does not go off all at once.
     */
    cookieStripe: {
      /** After everything has turned into a stripe, before the first one fires. */
      startDelaySec: 0.75,
      /** Between one converted stripe firing and the next. */
      stepDelaySec: 0.09,
      /**
       * Inside ONE of those firings: the gap between the cells of its line going. This is
       * what decides whether a stripe's gems pop WITH it or trail behind it — a converted
       * board fires many stripes in a row, and at the board's shared rate their pops pile
       * up and land long after the stripe that caused them. 0 clears each line at once.
       */
      stepSec: 0,
      beamSec: 0.18
    },
    /** Cookie + bomb: the same, with bombs. Timed on its own — the blasts are heavier. */
    cookieBomb: {
      startDelaySec: 0.6,
      stepDelaySec: 0.18,
      stepSec: 0.03,
      beamSec: 0.18
    },
    /**
     * Bomb + stripe: instead of both going off they MERGE into a single item covering a
     * `spanCells` × `spanCells` block at the swap. The gems under it are gone and the
     * block counts as filled — nothing falls into it while the item lives. Then its rows
     * clear end to end; `waveGapSec` later the item pops and its columns go with it.
     *
     * `spanCells` is the mechanic, not a look: 3 means three rows and three columns.
     * Even numbers have no centre cell, so keep it odd.
     */
    bombStripe: {
      enabled: true,
      spanCells: 3,
      /** Between the row wave and the column wave, which the item pops along with. */
      waveGapSec: 0,
      /** After the last wave, before the empty block is let go and refills. */
      endHoldSec: 0,
      stepSec: 0.03,
      beamSec: 0.18
    }
  };
  /**
   * The ring around the gem the player has picked, and how much that gem grows while it
   * is held. Distinct from {@link swapPulse}, which is the contact on the swap itself —
   * this one stays up until the selection is spent.
   */
  public readonly selection = {
    enabled: true,
    color: 0xffffff,
    /** How much the picked gem grows. 1 leaves it alone. */
    scale: 1
  };
  /**
   * The ring that marks contact on a swap — one on each of the two cells, growing and
   * fading out. Purely decoration: it is fired as the gems start trading places and
   * nothing waits for it.
   */
  public readonly swapPulse = {
    enabled: true,
    color: 0xffffff,
    /**
     * Opacity it starts at, fading to nothing over `sec`.
     *
     * The ring is drawn OVER the gems, so a translucent one shows the gem underneath and
     * takes its colour — white at 0.55 reads orange over a yellow gem. Near 1 it reads as
     * the colour it is set to whatever it passes over.
     */
    opacity: 0.95,
    /**
     * Diameter at the start and at the end, in CELLS — 1 is exactly one cell across, so
     * anything above that spills over the neighbours. The pair sets how far it GROWS.
     */
    fromCells: 0.3,
    toCells: 0.95,
    /**
     * Multiplies both of the above, so the whole ring can be sized up or down without
     * changing how much it grows. 1 leaves them as written.
     */
    scale: 0.8,
    sec: 0.35,
    /** Ring width as a fraction of its radius. 1 fills it in — a disc rather than a ring. */
    thickness: 0.1
  };
  /**
   * The score that floats up off a clear. One per MATCH; one per CELL when a booster is
   * what cleared it, so a sweep or a blast shows what it actually touched.
   */
  public readonly scoreText = {
    enabled: true,
    points: 60,
    color: "#ffffff",
    /** Height of the text as a fraction of a cell. */
    sizeCells: 0.48,
    /**
     * Labels built up front and kept for the life of the board, so a busy clear allocates
     * nothing. The board is 64 cells, so this covers the worst case — every gem scoring at
     * once — with room over. The pool still grows if it is ever drained.
     */
    poolSize: 100,
    /** How far it drifts up, in cells, over `sec`. */
    riseCells: 0.5,
    sec: 0.3,
    /**
     * How long the fade takes. Independent of `sec` so the label can keep climbing while it
     * goes, or hold its place and fade slowly after it has arrived. The label lives for
     * whichever of the two is longer.
     */
    fadeSec: 0.3,
    /**
     * Easing for the climb. `none` is a steady drift for the whole life, which is what reads
     * as rising. An `*.out` curve finishes the travel in the first third and the label then
     * hangs still for the rest of its life — over half a cell that looks static, not risen.
     */
    ease: "none",
    /**
     * Easing for the fade. Wants to be gentler than the climb's: `power2.in` holds full
     * opacity almost to the end and then drops, which reads as vanishing rather than
     * fading. `power1.in` is already on its way out by halfway.
     */
    fadeEase: "power1.in"
  };
  /** Shake on a clear of at least `minCells`, as a timeline track. 0 disables it. */
  public readonly shake = {
    minCells: 0,
    amplitude: 0.12,
    duration: 0.22
  };
  /**
   * The flash of light every popping gem leaves on its cell. Drawn with the `light` texture
   * in ADDITIVE blending, so it reads as light over the board rather than as a white disc.
   *
   * Fades IN, then OUT, growing the whole time — the grow is what gives it its push, and the
   * two fades are what keep it from arriving or leaving on a hard edge.
   *
   * `opacity` is the peak it reaches at the end of the fade in, so it is the knob for how
   * strong the whole effect reads. 0 makes it invisible without turning it off; `enabled`
   * false skips the work entirely.
   */
  public readonly popLight = {
    enabled: true,
    /** Diameter at full size, in cells. */
    sizeCells: 2.4,
    /** Starts at this fraction of full size and grows to it. */
    scaleFrom: 0.3,
    color: "#fff4d6",
    /** Peak, reached at the end of the fade in. */
    opacity: 0.25,
    inSec: 0.07,
    outSec: 0.1
  };
  /**
   * Pop burst, via the framework's pooled emitter. Sparks take the popped gem's own colour.
   * `count: 0` disables it — the emitter is not even built.
   *
   * `count` is PER GEM, so it multiplies by everything a clear touches: the cookie pair
   * takes all 64 cells, which is where `budget` earns its keep. Over the budget the module
   * simply refuses the spawn, so a busy cascade thins out rather than dropping frames.
   */
  public readonly popParticles = {
    count: 4,
    /** Outward speed in world units per second. */
    speed: 2.2,
    /** Spark size as a fraction of a cell. */
    size: 0.35,
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
  public readonly animInvalidSwapSec = 0.25;
  /** Pop: the gem shrinks away. Overlaps the fall, so it costs no wait. */
  public readonly animPopSec = 0.15;
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
  public readonly fallAccelCellsPerSec2 = 20;
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
