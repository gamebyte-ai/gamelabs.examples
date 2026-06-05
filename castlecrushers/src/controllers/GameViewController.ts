import {
  UnsubscribeBag,
  UpdateManager,
  type IInstanceResolver,
  type IViewController,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";

import type { IGameView } from "../views/IGameView.js";
import { CastleCrushersConfig } from "../CastleCrushersConfig.js";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType, GameStatus } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";
import { CastleOperations } from "../utilities/CastleOperations.js";

/**
 * Controller for the World view. Owns gameplay: it wires the view's entity
 * factory into CastleOperations (which spawns physics-backed entities through a
 * stage), forwards pointer input to launch/reset, and mirrors model state onto
 * the HUD via GameEvents. No game rules live here — operations owns them.
 */
export class GameViewController implements IViewController<IGameView> {
  private _view: IGameView | null = null;
  private _config: CastleCrushersConfig | null = null;
  private _model: IGameModelType | null = null;
  private _events: GameEvents | null = null;
  private _ops: CastleOperations | null = null;
  private _updateManager: UpdateManager | null = null;

  private readonly _subs = new UnsubscribeBag();
  private _updateUnsub: Unsubscribe | null = null;
  private _lastAmmo = -1;
  private _lastStatus: GameStatus | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(CastleCrushersConfig);
    this._model = resolver.getInstance(IGameModel);
    this._events = resolver.getInstance(GameEvents);
    this._ops = resolver.getInstance(CastleOperations);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IGameView): void {
    this._view = view;

    // Operations spawns entities through the stage using this renderer-agnostic factory.
    this._ops!.bindView((kind, shape) => view.createEntity(kind, shape));

    this._subs.add(view.onAimMove((x, y) => this._onAimMove(x, y)));
    this._subs.add(view.onAimRelease((x, y) => this._onAimRelease(x, y)));

    this._updateUnsub = this._updateManager!.register((dt) => this._onUpdate(dt));

    this._ops!.buildLevel();
    this._publishHud(); // emit initial ammo/status
  }

  private _onUpdate(dt: number): void {
    this._ops!.update(dt);
    this._publishHud();
  }

  private _onAimMove(x: number, y: number): void {
    if (this._model!.status !== "playing") return;
    this._view!.setAim(this._config!.ammo.originX, this._config!.ammo.originY, x, y);
  }

  private _onAimRelease(x: number, y: number): void {
    this._view!.clearAim();
    if (this._model!.status === "playing") this._ops!.launch(x, y);
    else this._ops!.reset();
  }

  /** Emit ammo/status to the HUD controller only when they change. */
  private _publishHud(): void {
    if (this._model!.ammoLeft !== this._lastAmmo) {
      this._lastAmmo = this._model!.ammoLeft;
      this._events!.emitAmmoChanged(this._lastAmmo);
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
    this._config = null;
    this._model = null;
    this._events = null;
    this._ops = null;
    this._updateManager = null;
  }
}
