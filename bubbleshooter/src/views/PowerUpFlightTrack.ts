import type * as THREE from "three";
import { Track } from "@gamebyte/gamelabsjs";

const TRACK_TYPE = "powerup-flight";

/**
 * Drives a single power-up collection icon's flight from a grid cell to
 * its HUD button. Cubic ease-in (`t³`) — slow start, fast finish —
 * matches the spec's "accelerates as it approaches the button". The
 * track owns timing + per-frame position writes; the view owns the
 * mesh's allocation + scene-graph parenting + cleanup (via `onArrived`).
 *
 * Pattern matches `CameraShakeTrack`: a `Track` subclass that mutates
 * an externally-owned object during `onUpdate` and delegates teardown
 * to a sink callback fired from `onEnd` / `onCancel`.
 */
export class PowerUpFlightTrack extends Track {
  private readonly _mesh: THREE.Object3D;
  private readonly _fromX: number;
  private readonly _fromY: number;
  private readonly _toX: number;
  private readonly _toY: number;
  private readonly _onArrived: () => void;

  public constructor(
    mesh: THREE.Object3D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    durationSeconds: number,
    onArrived: () => void,
  ) {
    super({ type: TRACK_TYPE, duration: durationSeconds });
    this._mesh = mesh;
    this._fromX = fromX;
    this._fromY = fromY;
    this._toX = toX;
    this._toY = toY;
    this._onArrived = onArrived;
  }

  protected override onUpdate(): void {
    const t = this.progress;
    const e = t * t * t;
    this._mesh.position.x = this._fromX + (this._toX - this._fromX) * e;
    this._mesh.position.y = this._fromY + (this._toY - this._fromY) * e;
  }

  protected override onEnd(): void {
    this._onArrived();
  }

  protected override onCancel(): void {
    // Same teardown path as `onEnd` — the view drops the mesh either
    // way. Triggered on level reload via `cancelByType`.
    this._onArrived();
  }
}
