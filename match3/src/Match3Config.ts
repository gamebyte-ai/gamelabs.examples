import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

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
  /** Orthographic half-height for top-down camera (world units; board ~7.4 + margin). */
  public readonly cameraOrthoSize = 11;
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
