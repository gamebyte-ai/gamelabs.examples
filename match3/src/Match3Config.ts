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
  public readonly rows = 8;
  public readonly cols = 8;
  public readonly gemTypeCount = 4;
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
  //                                    └─► fall ──► refill
  //                                        animFallSec  animSpawnSec
  //
  //  `animPopSec` runs in PARALLEL with the fall — popping gems are detached from
  //  their cells, so the drop no longer waits for them. It therefore controls how
  //  long the pop is visible, not how soon the next step starts.
  //
  //  What gates the NEXT match in the same columns is `animFallSec + animSpawnSec`.
  //  Lower those two to make cascades snappier; 0.25 / 0.30 is noticeably quicker
  //  than the defaults without losing readability.

  /** Gems trading places on a valid swap. */
  public readonly animSwapSec = 0.24;
  /** Bounce-and-return when a swap makes no match. Half out, half back. */
  public readonly animInvalidSwapSec = 0.3;
  /** Pop: the gem shrinks away. Overlaps the fall, so it costs no wait. */
  public readonly animPopSec = 0.32;
  /**
   * Easing for the pop. An `*.out` curve shrinks fastest at the start, so the gem
   * reads as reacting the instant it is matched; `*.in` would hold it at full size
   * and then snap, which looks like a delay before anything happens.
   */
  public readonly animPopEase = "power2.out";
  /** Surviving gems dropping into the gaps. Part of the gate on the next match. */
  public readonly animFallSec = 0.3;
  /** Fresh gems falling in from above the board. The other half of that gate. */
  public readonly animSpawnSec = 0.3;
  /**
   * Easing for gems dropping in (gravity + refill). Kept out of `bounce.*` on
   * purpose: a bounce lands the gem early but keeps the tween alive through its
   * tail, and the chain only resolves — and the next match only pops — once the
   * tween ends, which reads as lag. `power2.in` accelerates like a fall and ends
   * when it lands. `power1.in` if this feels too abrupt.
   */
  public readonly animFallEase = "power2.in";
  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 }
  };
}
