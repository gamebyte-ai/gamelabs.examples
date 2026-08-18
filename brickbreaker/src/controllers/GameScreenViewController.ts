import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { BrickBreakerConfig } from "../BrickBreakerConfig";

/** Feeds the boot screen its title/tagline from config. */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _config: BrickBreakerConfig | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(BrickBreakerConfig);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;
    this._view.setText(this._config!.title, this._config!.tagline);
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._config = null;
  }
}
