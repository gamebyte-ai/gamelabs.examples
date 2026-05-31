import {
  GridItemObjectOptions,
  GridsViewController,
  IGridsModel,
  UnsubscribeBag,
  type IGridItem,
  type IGridView,
  type IInstanceResolver,
  type IGridsModel as IGridsModelType,
  type IRectGrid,
} from "@gamebyte/gamelabsjs";
import { CellType } from "../../../constants/CellType.js";
import { TOWER_TYPES, TowerTypeId } from "../../../constants/TowerTypeDef.js";
import { TowerDefenseConfig } from "../../../TowerDefenseConfig.js";
import { GameEvents } from "../../../events/GameEvents.js";
import { ILevelState } from "../../../utilities/ILevelState.js";
import type { ILevelState as ILevelStateType } from "../../../utilities/ILevelState.js";
import { GameOperations } from "../../../utilities/GameOperations.js";
import { GameBoardItem } from "../models/GameBoardItem.js";
import { GameBoardItemObjectOptions } from "../views/GameBoardItemObjectOptions.js";
import type { IGameBoardsView } from "../views/IGameBoardsView.js";

/**
 * Controller for the tower defense grid.
 * Handles cell click, tower placement validation, and placement mode.
 *
 * Holds models only through readonly tokens ({@link IGridsModel},
 * {@link ILevelState}) and routes every grid mutation through
 * {@link GameOperations}, per the rule "Controllers must access model
 * state through readonly interfaces, not mutable model references"
 *.
 */
export class GameBoardsViewController extends GridsViewController {
  private _gameEvents: GameEvents | null = null;
  private _gridsView: IGameBoardsView | null = null;
  private _gridModel: IGridsModelType | null = null;
  private _level: ILevelStateType | null = null;
  private _ops: GameOperations | null = null;
  private readonly _tdSubs = new UnsubscribeBag();

  // ── Placement mode state ──────────────────────────────────────────────
  private _placingTowerType: TowerTypeId | null = null;
  /** Cell currently showing the range indicator (null = none). */
  private _rangeCell: { col: number; row: number } | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._gridModel = resolver.getInstance(IGridsModel);
    this._level = resolver.getInstance(ILevelState);
    this._ops = resolver.getInstance(GameOperations);
  }

  public override initialize(view: IGridView): void {
    super.initialize(view);
    this._gridsView = view as IGameBoardsView;
    this._gridsView.setCellPointerDownHandler((gridId, col, row) => this._onCellPointerDown(gridId, col, row));
    this._gridsView.setCellHoverHandler((col, row, hovered) => this._onCellHover(col, row, hovered));

    this._tdSubs.add(this._gameEvents!.onTeardownLevel(() => this._onTeardownLevel()));
    this._tdSubs.add(this._gameEvents!.onLevelGenerated(() => this._onLevelGenerated()));
    this._tdSubs.add(this._gameEvents!.onStartPlacement((type) => this._enterPlacementMode(type)));
    this._tdSubs.add(this._gameEvents!.onCancelPlacement(() => this._exitPlacementMode()));
    this._tdSubs.add(this._gameEvents!.onCannonFired((col, row, tx, tz) => this._gridsView?.animateCannonFire(col, row, tx, tz)));
  }

  protected override createItemObjectOption(item: IGridItem, grid: IRectGrid): GridItemObjectOptions {
    if (item instanceof GameBoardItem) {
      return new GameBoardItemObjectOptions(item.itemId, grid.preset, item.towerType);
    }
    return super.createItemObjectOption(item, grid);
  }

  // ── Cell interaction ──────────────────────────────────────────────────

  private _onCellPointerDown(gridId: number, col: number, row: number): void {
    if (!this._level || !this._gameEvents) return;
    if (gridId !== TowerDefenseConfig.GRID_ID) return;

    // Placement mode: try to place the tower
    if (this._placingTowerType !== null) {
      if (this._ops?.canPlaceTower(col, row)) {
        this._placeTower(col, row, this._placingTowerType);
        this._exitPlacementMode();
      }
      return;
    }

    const cellType = this._level.getCellType(col, row);
    if (cellType === CellType.Ground || cellType === CellType.Tower) {
      this._gameEvents.emitCellSelected(col, row);
    }
  }

  private _onCellHover(col: number, row: number, hovered: boolean): void {
    // Placement mode: update ghost preview.
    // Only reposition on hovered=true — do NOT hide on hovered=false.
    // When the pointer moves from cell A to cell B, A fires false and B
    // fires true in undefined order. Hiding on false would flicker the
    // ghost off whenever the leave event arrives after the enter event.
    if (this._placingTowerType !== null) {
      if (hovered) {
        this._gridsView?.updateGhostPosition(col, row, this._ops?.canPlaceTower(col, row) ?? false);
      }
      return;
    }

    // Normal mode: range indicator on tower hover
    if (hovered) {
      const grid = this._gridModel?.getGrid(TowerDefenseConfig.GRID_ID);
      const cell = grid?.getCell(col, row);
      if (cell?.item instanceof GameBoardItem) {
        const typeDef = TOWER_TYPES.get(cell.item.towerType);
        if (typeDef) {
          this._gridsView?.showRangeIndicator(col, row, typeDef.range, typeDef.color);
          this._rangeCell = { col, row };
          return;
        }
      }
      // Hovered a non-tower cell — hide if indicator is showing
      if (this._rangeCell) {
        this._gridsView?.hideRangeIndicator();
        this._rangeCell = null;
      }
    } else if (this._rangeCell?.col === col && this._rangeCell?.row === row) {
      this._gridsView?.hideRangeIndicator();
      this._rangeCell = null;
    }
  }

  // ── Placement mode ────────────────────────────────────────────────────

  private _enterPlacementMode(towerType: TowerTypeId): void {
    this._placingTowerType = towerType;
    this._gridsView?.showGhost(towerType);
  }

  private _exitPlacementMode(): void {
    if (this._placingTowerType === null) return;
    this._placingTowerType = null;
    this._gridsView?.removeGhost();
  }

  private _placeTower(col: number, row: number, towerType: TowerTypeId): void {
    if (!this._ops || !this._gameEvents) return;
    this._ops.placeTower(col, row, towerType);
    this._gameEvents.emitTowerPlaced(col, row, towerType);
  }

  // ── Level teardown / generation ────────────────────────────────────────

  /** Phase 1: cancel any in-progress placement UI. */
  private _onTeardownLevel(): void {
    this._exitPlacementMode();
    this._gridsView?.hideRangeIndicator();
    this._gridsView?.killCannonTweens();
    this._rangeCell = null;
  }

  /** Phase 2: refresh cell terrain textures for the new path layout. */
  private _onLevelGenerated(): void {
    this._gridsView?.refreshAllCells();
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  public override destroy(): void {
    this._tdSubs.flush();
    this._gridsView?.setCellPointerDownHandler(null);
    this._gridsView?.setCellHoverHandler(null);
    this._gridsView?.removeGhost();
    this._gridsView?.hideRangeIndicator();
    this._gridsView = null;
    this._gameEvents = null;
    this._gridModel = null;
    this._level = null;
    this._ops = null;
    super.destroy();
  }
}
