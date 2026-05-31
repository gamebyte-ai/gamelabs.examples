import {
  ParticleManager,
  UnsubscribeBag,
  UpdateManager,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import type { IEffectsView } from "../views/IEffectsView";
import type { BubbleColor } from "../constants/BubbleColor";
import { GameEvents } from "../events/GameEvents";

/**
 * Drives the {@link IEffectsView} from the bubble-popped event, registers
 * its pop-burst emitter on `ParticleManager` for the lifetime of the
 * controller, and ticks the score-popup animation. The view owns mesh
 * allocation; the controller brokers the manager registration —
 * matches avoidance's pattern (`ParticleManager` lives on the main DI
 * container, not on view DI).
 */
export class EffectsViewController implements IViewController<IEffectsView> {
  private _view: IEffectsView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;
  private _updateManager: UpdateManager | null = null;
  private _particleManager: ParticleManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
    this._updateManager = resolver.getInstance(UpdateManager);
    this._particleManager = resolver.getInstance(ParticleManager);
  }

  public initialize(view: IEffectsView): void {
    this._view = view;
    this._particleManager!.register(view.popBurstEmitter);
    this._subs.add(this._gameEvents!.onBubblePopped(this._onBubblePopped));
    this._subs.add(this._updateManager!.register(this._tick, 0));
  }

  private readonly _onBubblePopped = (x: number, y: number, color: BubbleColor, points: number): void => {
    this._view?.playPopBurst(x, y, color);
    this._view?.playScorePopup(x, y, color, points);
  };

  // Pop bursts are ticked by `ParticleManager`, so we only forward
  // the score-popup tick here.
  private readonly _tick = (dt: number): void => {
    this._view?.updateScorePopups(dt);
  };

  public destroy(): void {
    if (this._view && this._particleManager) {
      // Unregister + destroy through the manager so pooled meshes /
      // materials / geometry release in one place.
      const emitter = this._view.popBurstEmitter;
      this._particleManager.unregister(emitter);
      emitter.destroy();
    }
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
    this._updateManager = null;
    this._particleManager = null;
  }
}
