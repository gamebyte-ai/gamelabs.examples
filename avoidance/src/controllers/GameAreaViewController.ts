import { ParticleManager, UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IGameAreaView } from "../views/IGameAreaView";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";
import { GameOperations } from "../utilities/GameOperations.js";

export class GameAreaViewController implements IViewController<IGameAreaView> {
  private _view: IGameAreaView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameModel: IGameModelType | null = null;
  private _updateManager: UpdateManager | null = null;
  private _gameEvents: GameEvents | null = null;
  private _ops: GameOperations | null = null;
  private _particleManager: ParticleManager | null = null;
  private _updateUnsub: Unsubscribe | null = null;
  private _lastEnemyIds = new Set<number>();

  public inject(resolver: IInstanceResolver): void {
    this._gameModel = resolver.getInstance(IGameModel);
    this._updateManager = resolver.getInstance(UpdateManager);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._ops = resolver.getInstance(GameOperations);
    this._particleManager = resolver.getInstance(ParticleManager);
  }

  public initialize(view: IGameAreaView): void {
    this._view = view;

    this._particleManager!.register(view.propulsionEmitter);
    this._particleManager!.register(view.explosionEmitter);

    this._subs.add(this._gameEvents!.onDirectionInput((dx, dy) => this._ops?.setInput(dx, dy)));
    this._subs.add(this._gameEvents!.onRestart(() => this._onRestart()));
    this._subs.add(this._gameEvents!.onCollision((x, y) => this._view?.spawnExplosion(x, y)));
    this._updateUnsub = this._updateManager!.register((dt) => this._onUpdate(dt));

    this._ops!.startGame();
    this._syncView();
  }

  private _onRestart(): void {
    this._view?.removeAllEnemies();
    this._lastEnemyIds.clear();
    this._ops!.restart();
    this._syncView();
  }

  private _onUpdate(dt: number): void {
    this._ops!.update(dt);
    this._syncView();
  }

  private _syncView(): void {
    if (!this._view || !this._gameModel) return;

    this._view.setPlayerPosition(this._gameModel.playerX, this._gameModel.playerY);
    this._view.setPropulsionState(this._gameModel.playerVx, this._gameModel.playerVy);

    const currentIds = new Set<number>();
    for (const e of this._gameModel.enemies) {
      currentIds.add(e.id);
      if (!this._lastEnemyIds.has(e.id)) {
        this._view.addEnemy(e.id, e.x, e.y);
      } else {
        this._view.setEnemyPosition(e.id, e.x, e.y);
      }
    }

    for (const id of this._lastEnemyIds) {
      if (!currentIds.has(id)) {
        this._view.removeEnemy(id);
      }
    }

    this._lastEnemyIds = currentIds;
  }

  public destroy(): void {
    this._updateUnsub?.();
    this._updateUnsub = null;
    this._subs.flush();
    // Tear down emitters before the view's preDestroy runs (matches
    // CLEANUP order in WorldViewBase.destroy: super calls preDestroy
    // before controller.destroy, but app-level preDestroy reaches us
    // first via world.removeView). Either ordering is safe — the
    // emitter's destroy() removes itself from the scene graph and
    // disposes its pool, so the view's preDestroy doesn't find them.
    this._particleManager?.destroyByType("fx.propulsion");
    this._particleManager?.destroyByType("fx.explosion");
    this._view = null;
    this._gameModel = null;
    this._updateManager = null;
    this._gameEvents = null;
    this._ops = null;
    this._particleManager = null;
    this._lastEnemyIds.clear();
  }
}
