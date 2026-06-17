import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { TemplateConfig } from "../TemplateConfig";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _config: TemplateConfig | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(TemplateConfig);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;
    this._view.setTitle(this._config!.title);
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._config = null;
  }
}
