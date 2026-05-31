import {
  TimelineManager,
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import type { IPowerUpCollectionView } from "../views/IPowerUpCollectionView";
import { GameEvents } from "../events/GameEvents";

const FLIGHT_TRACK_TYPE = "powerup-flight";

/**
 * Wires power-up collection events to the {@link IPowerUpCollectionView}
 * and brokers `TimelineManager` registration. The view builds each
 * flight track (knowing about meshes + targets); the controller adds
 * the track to the manager (which lives on the main DI container, not
 * the view DI container) and cancels by type on level reload.
 *
 * Per-frame animation is driven by `TimelineManager` ticking each
 * `PowerUpFlightTrack`; the controller has no per-frame work.
 */
export class PowerUpCollectionViewController implements IViewController<IPowerUpCollectionView> {
  private _view: IPowerUpCollectionView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;
  private _timeline: TimelineManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
    this._timeline = resolver.getInstance(TimelineManager);
  }

  public initialize(view: IPowerUpCollectionView): void {
    this._view = view;
    const e = this._gameEvents!;
    this._subs.add(e.onPowerUpCollected(this._onPowerUpCollected));
    this._subs.add(e.onLayoutChanged(this._onLayoutChanged));
  }

  private readonly _onPowerUpCollected = (
    kind: "bomb" | "fireball",
    fromX: number,
    fromY: number,
  ): void => {
    const track = this._view?.buildFlightTrack(kind, fromX, fromY);
    if (!track) return;
    this._timeline?.add(track);
  };

  private readonly _onLayoutChanged = (): void => {
    // Cancelling fires each track's `onCancel` → its `onArrived`
    // callback in the view detaches the mesh. The view's `clearAll`
    // is a safety sweep for anything orphaned.
    this._timeline?.cancelByType(FLIGHT_TRACK_TYPE);
    this._view?.clearAll();
  };

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
    this._timeline = null;
  }
}
