import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IEndView } from "../views/IEndView";
import { SortExpressConfig } from "../SortExpressConfig";
import { StoreService } from "../services/StoreService";

/** Wires the end card's download CTA to the platform store. */
export class EndViewController implements IViewController<IEndView> {
  private _view: IEndView | null = null;
  private _config: SortExpressConfig | null = null;
  private _store: StoreService | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(SortExpressConfig);
    this._store = resolver.getInstance(StoreService);
  }

  public initialize(view: IEndView): void {
    this._view = view;
    this._subs.add(
      view.onDownload(() =>
        this._store!.openStore({
          ios: this._config!.end.storeUrl,
          android: this._config!.end.storeUrlAndroid,
        }),
      ),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._config = null;
    this._store = null;
  }
}
