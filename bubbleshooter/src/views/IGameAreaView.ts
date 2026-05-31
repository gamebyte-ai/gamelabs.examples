import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Parent-of-sub-views interface for the game area. Exposes only the
 * three world-space pointer events (aim move, fire click, swap
 * click) that the parent captures and forwards. Visual concerns
 * (grid, shooter, aim, flight, falling, effects) each live behind
 * their own `IFooView` interface and are wired by their own
 * controllers — the parent does not route to children.
 */
export interface IGameAreaView extends IView {
  /** Rebuild play-area chrome (background, border, cell outlines)
   *  after the layout's width has changed (per-level override). */
  rebuildPlayArea(): void;
  onAimAtWorld(cb: (worldX: number, worldY: number) => void): Unsubscribe;
  onFire(cb: () => void): Unsubscribe;
  onSwap(cb: () => void): Unsubscribe;
}
