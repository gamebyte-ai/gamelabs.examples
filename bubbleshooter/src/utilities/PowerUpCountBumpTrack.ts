import { Track } from "@gamebyte/gamelabsjs";
import type { PowerUpKind } from "../constants/PowerUpKind";

const TRACK_TYPE = "powerup-count-bump";

/**
 * Defers a power-up inventory bump until `duration` seconds after the
 * collection event, so the badge ticks up at the moment the matching
 * {@link PowerUpFlightTrack} icon visually arrives at its HUD button.
 *
 * Mirrors the avoidance module's `CameraShakeTrack` shape: a `Track`
 * subclass with a single externally-injected sink (the `onArrived`
 * callback that does the actual model write) wired through one of the
 * lifecycle hooks. The track owns timing only — the model owns state.
 */
export class PowerUpCountBumpTrack extends Track {
  private readonly _kind: PowerUpKind;
  private readonly _onArrived: (kind: PowerUpKind) => void;

  public constructor(kind: PowerUpKind, durationSeconds: number, onArrived: (kind: PowerUpKind) => void) {
    super({ type: TRACK_TYPE, duration: durationSeconds });
    this._kind = kind;
    this._onArrived = onArrived;
  }

  public get kind(): PowerUpKind {
    return this._kind;
  }

  protected override onEnd(): void {
    this._onArrived(this._kind);
  }

  protected override onCancel(): void {
    // Cancellation happens on level reload via `cancelAll` — drop the
    // bump silently. The new level resets inventory anyway, so there's
    // nothing meaningful to credit.
  }
}
