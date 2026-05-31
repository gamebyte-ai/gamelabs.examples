import { GridEvents, GridsModel, RectGrid, RectGridPreset, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { TicTacToeConfig } from "../TicTacToeConfig";
import { GameGridAllocator } from "../modules/gamegrid/utilities/GameGridAllocator.js";

export class GridOperations implements IInjectionTarget {
  private _model: GridsModel | null = null;
  private _events: GridEvents | null = null;
  private _config: TicTacToeConfig | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._model = resolver.getInstance(GridsModel);
    this._events = resolver.getInstance(GridEvents);
    this._config = resolver.getInstance(TicTacToeConfig);
  }

  public createGrid(): void {
    const model = this._model!;
    const events = this._events!;
    const config = this._config!;
    const allocator = new GameGridAllocator();
    const preset = new RectGridPreset({ columnCount: config.boardColumnCount, rowCount: config.boardRowCount });
    const grid = new RectGrid(config.boardId, preset, events, allocator);
    model.addGrid(grid);
  }
}
