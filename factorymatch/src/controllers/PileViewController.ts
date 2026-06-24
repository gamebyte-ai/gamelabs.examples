import {
  UnsubscribeBag,
  UpdateManager,
  type IInstanceResolver,
  type IViewController,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";

import type { IPileView } from "../views/IPileView.js";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType, GameStatus } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";
import { FactoryOperations } from "../utilities/FactoryOperations.js";

/**
 * Controller for the World view. Owns gameplay: wires the view's entity factory
 * into FactoryOperations (which spawns physics-backed shapes through a stage),
 * forwards pick rays, drives the fly-to-slot animation with the pick result, and
 * mirrors score/status onto the HUD via GameEvents. No game rules here.
 */
export class PileViewController implements IViewController<IPileView> {
  private _view: IPileView | null = null;
  private _model: IGameModelType | null = null;
  private _events: GameEvents | null = null;
  private _ops: FactoryOperations | null = null;
  private _updateManager: UpdateManager | null = null;

  private readonly _subs = new UnsubscribeBag();
  private _updateUnsub: Unsubscribe | null = null;
  private _lastScore = -1;
  private _lastStatus: GameStatus | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._model = resolver.getInstance(IGameModel);
    this._events = resolver.getInstance(GameEvents);
    this._ops = resolver.getInstance(FactoryOperations);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IPileView): void {
    this._view = view;
    this._ops!.bindView((kind) => view.createEntity(kind));

    this._subs.add(view.onPick((bodyId) => this._onPick(bodyId)));
    // The HUD intro countdown fires this when it finishes; play begins then and
    // the selection outline turns on. It turns off again at game over.
    this._subs.add(
      this._events!.onStarted(() => {
        this._ops!.start();
        view.setInteractive(true);
      }),
    );
    this._subs.add(
      this._events!.onStatusChanged((status) => {
        if (status !== "playing") view.setInteractive(false);
      }),
    );
    this._updateUnsub = this._updateManager!.register((dt) => this._onUpdate(dt));

    this._ops!.buildLevel();
    this._publishHud();
  }

  private _onUpdate(dt: number): void {
    this._ops!.update(dt);
    this._publishHud();
  }

  private _onPick(bodyId: number | null): void {
    // Only collect while playing; clicks after game over do nothing (no restart).
    if (this._model!.status !== "playing" || bodyId === null) return;
    const result = this._ops!.pick(bodyId);
    if (result) {
      this._view!.applyCollect(result);
      if (result.goal) this._events!.emitGoalChanged(result.goal.index, result.goal.remaining);
    }
    this._publishHud();
  }

  private _publishHud(): void {
    if (this._model!.score !== this._lastScore) {
      this._lastScore = this._model!.score;
      this._events!.emitScoreChanged(this._lastScore);
    }
    if (this._model!.status !== this._lastStatus) {
      this._lastStatus = this._model!.status;
      this._events!.emitStatusChanged(this._lastStatus);
    }
  }

  public destroy(): void {
    this._updateUnsub?.();
    this._updateUnsub = null;
    this._subs.flush();
    this._ops?.destroy();
    this._view = null;
    this._model = null;
    this._events = null;
    this._ops = null;
    this._updateManager = null;
  }
}
