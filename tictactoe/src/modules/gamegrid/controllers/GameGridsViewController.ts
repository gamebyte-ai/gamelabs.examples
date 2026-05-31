import type { IGridItem } from "@gamebyte/gamelabsjs";
import type { IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IRectGrid } from "@gamebyte/gamelabsjs";
import { GridsViewController } from "@gamebyte/gamelabsjs";
import { GameItem } from "../models/GameItem.js";
import { GameItemObjectOptions } from "../views/GameItemObjectOptions.js";
import { GameGridsView } from "../views/GameGridsView.three.js";
import { GameTurnManagerToken, type GameTurnManager } from "../../../utilities/GameTurnManager.js";
import { TicTacToeConfig } from "../../../TicTacToeConfig.js";

export class GameGridsViewController extends GridsViewController {
  private _turnManager: GameTurnManager | null = null;
  private _config: TicTacToeConfig | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._turnManager = resolver.getInstance(GameTurnManagerToken);
    this._config = resolver.getInstance(TicTacToeConfig);
  }

  public override initialize(view: import("@gamebyte/gamelabsjs").IGridView): void {
    super.initialize(view);
    if (view instanceof GameGridsView) {
      view.setCellPointerDownHandler((gridId, col, row) => this._handleCellPointerDown(gridId, col, row));
    }
  }

  protected override createItemObjectOption(item: IGridItem, grid: IRectGrid): GameItemObjectOptions {
    if (!(item instanceof GameItem)) throw new Error("Expected GameItem");
    return new GameItemObjectOptions(item.itemId, grid.preset, item.team);
  }

  private _handleCellPointerDown(gridId: number, col: number, row: number): void {
    if (gridId !== this._config?.boardId) return;
    this._turnManager?.placeMark(gridId, col, row);
  }

  public override destroy(): void {
    super.destroy();
    this._turnManager = null;
    this._config = null;
  }
}
