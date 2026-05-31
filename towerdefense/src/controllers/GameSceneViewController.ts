import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import { GameEvents } from "../events/GameEvents.js";
import type { IGameSceneView } from "../views/IGameSceneView.js";

/**
 * Drives the {@link IGameSceneView} HP-bar visual from game events.
 * Holds no domain logic — listens to `levelGenerated` / `baseHpChanged` /
 * `enemyKilled` and pushes the result into the view.
 */
export class GameSceneViewController implements IViewController<IGameSceneView> {
  private _view: IGameSceneView | null = null;
  private _events: GameEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._events = resolver.getInstance(GameEvents);
  }

  public initialize(view: IGameSceneView): void {
    this._view = view;
    view.showBaseHpBar();

    this._subs.add(this._events!.onTeardownLevel(() => this._view?.hideBaseHpBar()));
    this._subs.add(this._events!.onLevelGenerated(() => this._view?.showBaseHpBar()));
    this._subs.add(this._events!.onBaseHpChanged((hp, maxHp) => this._view?.setBaseHpRatio(hp / maxHp)));
    this._subs.add(this._events!.onEnemyKilled((reward, x, z) => this._view?.showGoldPopup(x, z, reward)));
    // Combat effects — manager emits, controller translates to view calls
    // so the view stays free of diContainer-only bindings.
    this._subs.add(this._events!.onAreaImpact((x, z, r) => this._view?.spawnShockwave(x, z, r)));
    this._subs.add(
      this._events!.onTeslaArcFired((x1, y1, z1, x2, y2, z2) => this._view?.spawnTeslaArc(x1, y1, z1, x2, y2, z2)),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._events = null;
  }
}
