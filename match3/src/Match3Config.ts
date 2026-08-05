import { SCREEN_TRANSITION_TYPES, type ScreenTransition, type ViewportConfig } from "@gamebyte/gamelabsjs";

/**
 * Match-3 tuning, gem palette, and screen transition.
 */
export class Match3Config {
  public static readonly GRID_ID = 1;
  /** Shared by Three.js gems and tuning (`gemTypeCount` should not exceed palette length). */
  public static readonly GEM_PALETTE: readonly number[] = [0xe11d48, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7];
  public readonly rows = 8;
  public readonly cols = 8;
  public readonly gemTypeCount = 5;
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
  /** Scene backdrop behind the board. Letterbox bars stay the mount color, not this. */
  public readonly backgroundColor = 0x202020;
  /** Outline framing the whole grid. Individual cells are not drawn. */
  public readonly boardOutlineColor = 0xe2e8f0;
  /** Outline stroke width in world units. */
  public readonly boardOutlineThickness = 0.09;
  /** Gap between the outermost cells and the outline. */
  public readonly boardOutlinePadding = 0.12;
  public readonly scorePerGem = 10;
  public readonly gemColors: readonly number[] = Match3Config.GEM_PALETTE;
  public readonly animSwapSec = 0.24;
  public readonly animInvalidSwapSec = 0.2;
  public readonly animPopSec = 0.32;
  /** Max uniform scale during match pop (scale up then shrink to clear). */
  public readonly animPopPeakScale = 1.34;
  public readonly animFallSec = 0.4;
  public readonly animSpawnSec = 0.42;
  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 }
  };
}
