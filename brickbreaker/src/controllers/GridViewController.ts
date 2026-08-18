import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGridView } from "../views/IGridView";

/** Drives the grid's per-frame ball physics off the UpdateManager tick. The view
 * handles its own aim/shoot input; this controller just feeds it `update(dt)`
 * (the view's DI container can't resolve UpdateManager, but the controller's can). */
export class GridViewController implements IViewController<IGridView> {
  private _view: IGridView | null = null;
  private _updateManager: UpdateManager | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IGridView): void {
    this._view = view;
    this._subs.add(this._updateManager!.register((dt) => this._view?.update(dt)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._updateManager = null;
  }
}
