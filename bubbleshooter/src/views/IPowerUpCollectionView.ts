import type { IView } from "@gamebyte/gamelabsjs";
import type { PowerUpKind } from "../constants/PowerUpKind";
import type { PowerUpFlightTrack } from "./PowerUpFlightTrack";

/**
 * In-flight power-up collection icons. The view allocates each icon's
 * mesh + builds its `PowerUpFlightTrack`; the controller resolves
 * `TimelineManager` (which lives on the main DI container, not the
 * view DI container) and adds the track. On flight end the track's
 * `onArrived` callback detaches the mesh.
 *
 * Animation runs over `BubbleShooterConfig.powerUpCollectDurationSeconds`
 * with a cubic ease-in profile — slow start, fast finish — so the icon
 * arrival visually lines up with the model-side
 * `PowerUpCountBumpTrack` that bumps the badge inventory.
 */
export interface IPowerUpCollectionView extends IView {
  /**
   * Allocate a mesh + build the matching flight track. Returns `null`
   * if the view isn't fully initialised yet (no targets / no
   * geometry). The controller is responsible for adding the returned
   * track to `TimelineManager`.
   */
  buildFlightTrack(kind: PowerUpKind, fromX: number, fromY: number): PowerUpFlightTrack | null;
  /** Drop every in-flight icon's mesh. Called on level reload after the controller cancels matching tracks. */
  clearAll(): void;
}
