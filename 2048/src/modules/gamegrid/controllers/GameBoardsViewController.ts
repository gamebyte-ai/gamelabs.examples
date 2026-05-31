import type { IGridItem, IGridView, IInstanceResolver, IRectGrid, Unsubscribe } from "@gamebyte/gamelabsjs";
import { GridsViewController, KeyboardListener, UnsubscribeBag } from "@gamebyte/gamelabsjs";
import { Game2048Config } from "../../../Game2048Config.js";
import { Game2048AssetIds } from "../../../Game2048AssetIds.js";
import { IGameModel } from "../../../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../../../models/IGameModel.js";
import { GameBoardItem } from "../models/GameBoardItem.js";
import { GameOperations, type MoveDirection } from "../../../utilities/GameOperations.js";
import { GameEvents } from "../../../events/GameEvents.js";
import { GameBoardItemObjectOptions } from "../views/GameBoardItemObjectOptions.js";
import type { IGameBoardsView } from "../views/IGameBoardsView.js";

const KEY_TO_DIRECTION: Record<string, MoveDirection> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  KeyA: "left",
  KeyD: "right",
  KeyW: "up",
  KeyS: "down",
};

const SWIPE_MIN_DISTANCE_PX = 24;

/**
 * Drives the 2048 board: maps keyboard / swipe input to {@link MoveDirection},
 * runs the slide animation, commits the move and triggers the spawn animation.
 */
export class GameBoardsViewController extends GridsViewController {
  // Note: base `GridsViewController` already declares private `_view`, `_subs`, `_model`, `_events`.
  // We must use distinct names here so we don't shadow the base instance fields.
  private _gameModel: IGameModelType | null = null;
  private _operations: GameOperations | null = null;
  private _gameEvents: GameEvents | null = null;
  private _keyboard: KeyboardListener | null = null;
  private _gridsView: IGameBoardsView | null = null;
  private _inputLocked = false;
  private _gameOver = false;
  private _keyUnsub: Unsubscribe | null = null;
  private readonly _ownSubs = new UnsubscribeBag();
  private _swipeStartX: number | null = null;
  private _swipeStartY: number | null = null;
  private readonly _onPointerDown = (e: PointerEvent): void => this._handlePointerDown(e);
  private readonly _onPointerUp = (e: PointerEvent): void => this._handlePointerUp(e);

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._gameModel = resolver.getInstance(IGameModel);
    this._operations = resolver.getInstance(GameOperations);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._keyboard = resolver.getInstance(KeyboardListener);
  }

  public override initialize(view: IGridView): void {
    super.initialize(view);
    this._gridsView = view as IGameBoardsView;

    this._keyUnsub = this._keyboard?.addKeyPressedHandler((code) => this._onKeyPressed(code)) ?? null;

    this._ownSubs.add(this._gameEvents?.onRestartTapped(() => this._restart()));

    window.addEventListener("pointerdown", this._onPointerDown, { passive: true });
    window.addEventListener("pointerup", this._onPointerUp, { passive: true });

    // Initial score / best are zero, but emit so HUD reflects current state.
    this._gameEvents?.emitScoreChanged(this._gameModel?.score ?? 0);
    this._gameEvents?.emitBestChanged(this._gameModel?.best ?? 0);
  }

  protected override createItemObjectOption(item: IGridItem, grid: IRectGrid): GameBoardItemObjectOptions {
    if (!(item instanceof GameBoardItem)) throw new Error("Expected GameBoardItem");
    return new GameBoardItemObjectOptions(item.itemId, grid.preset, item.value);
  }

  private _onKeyPressed(code: string): void {
    const dir = KEY_TO_DIRECTION[code];
    if (!dir) return;
    void this._tryMove(dir);
  }

  private _handlePointerDown(e: PointerEvent): void {
    this._swipeStartX = e.clientX;
    this._swipeStartY = e.clientY;
  }

  private _handlePointerUp(e: PointerEvent): void {
    if (this._swipeStartX === null || this._swipeStartY === null) return;
    const dx = e.clientX - this._swipeStartX;
    const dy = e.clientY - this._swipeStartY;
    this._swipeStartX = null;
    this._swipeStartY = null;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX && Math.abs(dy) < SWIPE_MIN_DISTANCE_PX) return;
    const dir: MoveDirection = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    void this._tryMove(dir);
  }

  private async _tryMove(direction: MoveDirection): Promise<void> {
    const svc = this._operations;
    const events = this._gameEvents;
    const view = this._gridsView;
    if (!svc || !events || !view || this._inputLocked || this._gameOver) return;

    const plan = svc.planMove(direction);
    if (!plan.moved) {
      events.emitPlaySfx(Game2048AssetIds.SfxInvalid);
      return;
    }

    this._inputLocked = true;
    try {
      const gridId = Game2048Config.GRID_ID;
      events.emitPlaySfx(plan.merges.length > 0 ? Game2048AssetIds.SfxMerge : Game2048AssetIds.SfxMove);
      await view.animateMove(gridId, plan);
      const spawn = svc.commitPlan(plan);
      events.emitScoreChanged(this._gameModel!.score);
      events.emitBestChanged(this._gameModel!.best);
      if (plan.merges.length > 0) await view.animateMergePops(gridId, plan);
      if (spawn) {
        events.emitPlaySfx(Game2048AssetIds.SfxSpawn);
        await view.animateSpawn(gridId, spawn);
      }
      if (!svc.canMove()) {
        this._gameOver = true;
        events.emitGameOver();
      }
    } finally {
      this._inputLocked = false;
    }
  }

  private _restart(): void {
    if (!this._operations || !this._gameEvents || !this._gameModel) return;
    this._operations.reset();
    this._gameOver = false;
    this._inputLocked = false;
    this._gameEvents.emitScoreChanged(this._gameModel.score);
    this._gameEvents.emitBestChanged(this._gameModel.best);
  }

  public override destroy(): void {
    window.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointerup", this._onPointerUp);
    this._keyUnsub?.();
    this._keyUnsub = null;
    this._ownSubs.flush();
    this._gridsView = null;
    this._gameModel = null;
    this._operations = null;
    this._gameEvents = null;
    this._keyboard = null;
    super.destroy();
  }
}
