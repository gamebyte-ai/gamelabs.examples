import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController, type Unsubscribe } from "@gamebyte/gamelabsjs";

import type { IGameView } from "../views/IGameView.js";
import { MergeOperations } from "../utilities/MergeOperations.js";

/**
 * Controller for the Content game view. Wires the view (as the renderer-agnostic
 * presenter) into `MergeOperations`, forwards the launch, and drives the two
 * per-frame ticks — operations first (physics sync + rules), then the view's
 * visual tweening. No game rules live here; operations owns them.
 */
export class GameViewController implements IViewController<IGameView> {
  private _view: IGameView | null = null;
  private _ops: MergeOperations | null = null;
  private _updateManager: UpdateManager | null = null;

  private readonly _subs = new UnsubscribeBag();
  private _opsUnsub: Unsubscribe | null = null;
  private _viewUnsub: Unsubscribe | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._ops = resolver.getInstance(MergeOperations);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IGameView): void {
    this._view = view;

    this._ops!.bindView(view);
    this._subs.add(view.onLaunch((gx, gy) => this._ops!.launch(gx, gy)));

    // Operations runs first (steps rules + syncs bodies into the view), then the
    // view advances its own visual tweens on the freshly-synced poses.
    this._opsUnsub = this._updateManager!.register((dt) => this._ops!.update(dt));
    this._viewUnsub = this._updateManager!.register((dt) => view.tick(dt));

    this._ops!.buildLevel();
  }

  public destroy(): void {
    this._opsUnsub?.();
    this._opsUnsub = null;
    this._viewUnsub?.();
    this._viewUnsub = null;
    this._subs.flush();
    this._ops?.destroy();
    this._view = null;
    this._ops = null;
    this._updateManager = null;
  }
}
