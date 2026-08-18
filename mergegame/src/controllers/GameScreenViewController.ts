import { type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView.js";
import { MergeGameConfig } from "../MergeGameConfig.js";

/** HUD controller — shows the current level. No gameplay lives here. */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _config: MergeGameConfig | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(MergeGameConfig);
  }

  public initialize(view: IGameScreenView): void {
    view.setLevel(this._config!.levels.start);
  }

  public destroy(): void {
    this._config = null;
  }
}
