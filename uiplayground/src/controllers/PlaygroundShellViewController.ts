import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import { DEMO_REGISTRY } from "../constants/DemoRegistry.js";
import { ControlsManager } from "../utilities/ControlsManager.js";
import type { IPlaygroundShellView } from "../views/IPlaygroundShellView.js";

/**
 * Routes sidebar selections into the shell view's demo lifecycle and
 * binds the live shell view to the shared `ControlsManager` so demo
 * controllers can populate the controls panel through it.
 *
 * Owns no rendering primitives — the demo registry is a pure-data
 * constant; the active id is the only mutable state.
 */
export class PlaygroundShellViewController implements IViewController<IPlaygroundShellView> {
  private _controlsManager: ControlsManager | null = null;
  private _view: IPlaygroundShellView | null = null;
  private _activeId: string | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controlsManager = resolver.getInstance(ControlsManager);
  }

  public initialize(view: IPlaygroundShellView): void {
    if (!this._controlsManager) {
      throw new Error("PlaygroundShellViewController is not initialized");
    }
    this._view = view;
    this._controlsManager.bindShell(view);
    view.setSidebarItems(DEMO_REGISTRY);

    this._subs.add(view.onSidebarSelected((id) => this._activate(id)));

    if (DEMO_REGISTRY.length > 0) this._activate(DEMO_REGISTRY[0]!.id);
  }

  public destroy(): void {
    this._subs.flush();
    this._view?.unmountDemo();
    this._controlsManager?.unbindShell();
    this._controlsManager = null;
    this._view = null;
    this._activeId = null;
  }

  private _activate(id: string): void {
    if (!this._view) return;
    if (this._activeId === id) return;
    const entry = DEMO_REGISTRY.find((d) => d.id === id);
    if (!entry) return;
    this._activeId = id;
    this._view.setActiveSidebarItem(id);
    this._view.mountDemo(id);
  }
}
