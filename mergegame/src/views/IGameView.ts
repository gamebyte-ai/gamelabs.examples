import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IMergePresenter } from "../utilities/MergeOperations.js";

/**
 * The game-objects view (HUD **Content** layer). It renders the board, the
 * launched items (via the `IMergePresenter` adapters the stage drives), the
 * launcher + aim, and the merge effects, and reports the launch. It owns the
 * perspective projection and all per-frame visual tweening (`tick`); it never
 * reads the physics world or runs game rules.
 */
export interface IGameView extends IView, IMergePresenter {
  /** Advance view-only animation: launcher smoothing, pop-ins, merge slides, effects. */
  tick(dtSeconds: number): void;

  /** Fires on release with the launch origin in GAME-space coordinates. */
  onLaunch(cb: (gx: number, gy: number) => void): Unsubscribe;

  /** Fires when the "Play Again" button is pressed on the completion overlay. */
  onReplay(cb: () => void): Unsubscribe;
}
