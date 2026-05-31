import { GridsModel, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { TowerDefenseConfig } from "../TowerDefenseConfig.js";
import { GameState } from "../models/GameState.js";
import { GameEvents } from "../events/GameEvents.js";
import { GameBoardItem } from "../modules/gamegrid/models/GameBoardItem.js";
import { TowerTypeId } from "../constants/TowerTypeDef.js";
import { CellType } from "../constants/CellType.js";
import { LevelManager } from "./LevelManager.js";

/**
 * In-domain operations that mutate game state.
 *
 * Owns the mutable {@link GameState} reference and the concrete
 * {@link GridsModel}. Controllers and the App resolve `GameOperations`
 * for every state write — they themselves never hold a mutable reference
 * to either model.
 *
 * Every gold mutation emits `GameEvents.goldChanged` so the HUD can
 * refresh without each call-site having to do it manually.
 */
export class GameOperations implements IInjectionTarget {
  private _state!: GameState;
  private _config!: TowerDefenseConfig;
  private _events!: GameEvents;
  private _grids!: GridsModel;
  private _level!: LevelManager;
  private _nextItemId = 1;
  private _passiveIncomeAccum = 0;

  public inject(resolver: IInstanceResolver): void {
    this._state = resolver.getInstance(GameState);
    this._config = resolver.getInstance(TowerDefenseConfig);
    this._events = resolver.getInstance(GameEvents);
    this._grids = resolver.getInstance(GridsModel);
    this._level = resolver.getInstance(LevelManager);
  }

  // ── Gold mutations ────────────────────────────────────────────────────

  /** Award gold to the player (enemy kill, passive income, etc.). */
  public addGold(amount: number): void {
    this._state.addGold(amount);
    this._events.emitGoldChanged(this._state.gold);
  }

  /** Record an enemy kill: awards gold and increments the kill stat. */
  public rewardKill(goldReward: number): void {
    this._state.addGold(goldReward);
    this._state.recordKill();
    this._events.emitGoldChanged(this._state.gold);
    this._events.emitStatsChanged(this._state.kills, this._state.waveNumber);
  }

  /**
   * Tries to deduct `amount` gold. Returns `true` if the player could
   * afford it, `false` otherwise (state is unchanged on `false`).
   */
  public spendGold(amount: number): boolean {
    const ok = this._state.spendGold(amount);
    if (ok) this._events.emitGoldChanged(this._state.gold);
    return ok;
  }

  // ── HP mutations ──────────────────────────────────────────────────────

  public damageBase(amount: number): void {
    this._state.damageBase(amount);
    this._events.emitBaseHpChanged(this._state.baseHp, this._state.maxBaseHp);
  }

  // ── Tower placement ───────────────────────────────────────────────────

  /**
   * Placement rule: a cell must be a Tower cell (adjacent to the path but
   * not adjacent to spawn/base) and must not already hold a tower.
   */
  public canPlaceTower(col: number, row: number): boolean {
    if (this._level.getCellType(col, row) !== CellType.Tower) return false;
    const grid = this._grids.getGrid(TowerDefenseConfig.GRID_ID);
    if (!grid) return false;
    const cell = grid.getCell(col, row);
    return cell?.item === null;
  }

  public placeTower(col: number, row: number, towerType: TowerTypeId): number {
    const grid = this._grids.getGrid(TowerDefenseConfig.GRID_ID);
    if (!grid) throw new Error("Game grid not initialized");
    const id = this._nextItemId++;
    grid.setCellItem(col, row, new GameBoardItem(id, towerType));
    return id;
  }

  public clearAllTowers(): void {
    const grid = this._grids.getGrid(TowerDefenseConfig.GRID_ID);
    if (!grid) return;
    for (let c = 0; c < grid.columnCount; c++) {
      for (let r = 0; r < grid.rowCount; r++) {
        const cell = grid.getCell(c, r);
        if (cell?.item) grid.setCellItem(c, r, null);
      }
    }
  }

  // ── Passive income ────────────────────────────────────────────────────

  /**
   * Called from the per-frame update loop. Accumulates time and awards
   * a small gold income at regular intervals.
   */
  public tickPassiveIncome(dt: number): void {
    this._passiveIncomeAccum += dt;
    if (this._passiveIncomeAccum >= this._config.passiveIncomeInterval) {
      this._passiveIncomeAccum -= this._config.passiveIncomeInterval;
      this.addGold(this._config.passiveIncomeAmount);
    }
  }

  // ── Level lifecycle ──────────────────────────────────────────────────

  public teardownLevel(): void {
    this.clearAllTowers();
    this._passiveIncomeAccum = 0;
  }

  public startNewLevel(): void {
    this._level.generateLevel();
    this._state.reset(this._config.startingGold, this._config.baseHp);
    this._passiveIncomeAccum = 0;
    this._events.emitGoldChanged(this._state.gold);
    this._events.emitBaseHpChanged(this._state.baseHp, this._state.maxBaseHp);
    this._events.emitStatsChanged(this._state.kills, this._state.waveNumber);
  }
}
