import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(_resolver: IInstanceResolver): void {}

  public initialize(view: IGameScreenView): void {
    this._view = view;
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
  }
}
