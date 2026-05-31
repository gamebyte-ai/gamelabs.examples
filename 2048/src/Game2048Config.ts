import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * 2048 board sizing, animation tunings and screen transitions.
 */
export class Game2048Config {
  public static readonly GRID_ID = 1;
  public readonly rows = 4;
  public readonly cols = 4;
  /** Initial number of tiles spawned at the start of a game. */
  public readonly initialTileCount = 2;
  /** Probability that a freshly-spawned tile is a 4 (otherwise 2). */
  public readonly fourSpawnChance = 0.1;
  /** World cell size for {@link RectGridPreset} (Three.js board). */
  public readonly gridColumnSize = 1;
  public readonly gridRowSize = 1;
  /** World-space margin around the board on every side. The camera ortho size is
   *  recomputed on every resize so the entire `boardSize + 2 * boardMargin` span
   *  fits inside the viewport regardless of aspect ratio. */
  public readonly boardMargin = 1;
  /** Slide tween (per move). */
  public readonly animSlideSec = 0.16;
  /** Pop tween that flashes a freshly merged tile. */
  public readonly animMergePopSec = 0.18;
  public readonly animMergePopPeakScale = 1.22;
  /** Spawn tween for the new random tile after each move. */
  public readonly animSpawnSec = 0.18;
  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 }
  };
}
