import { UIEvents, UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import { GameEvents } from "../events/GameEvents.js";
import { LevelManager } from "../utilities/LevelManager.js";
import type { IWinPopupView } from "../views/IWinPopupView.js";

/**
 * Win popup controller.
 *
 * Seeds the popup with the current level number and its "final-level"
 * styling. On "Next Level" / "Play Again", closes the popup and fires
 * {@link GameEvents.emitAdvanceLevel}; the {@link BoardViewController}
 * listens on that to load the next level (the LevelManager wraps back
 * to level 0 after the last one, so `Play Again` and `Next Level` share
 * the same wiring).
 */
export class WinPopupViewController implements IViewController<IWinPopupView> {
  private _uiEvents: UIEvents | null = null;
  private _gameEvents: GameEvents | null = null;
  private _levels: LevelManager | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._uiEvents = resolver.getInstance(UIEvents);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._levels = resolver.getInstance(LevelManager);
  }

  public initialize(view: IWinPopupView): void {
    if (!this._levels) throw new Error("WinPopupViewController is not initialized");
    view.setLevelInfo(this._levels.displayNumber, this._levels.total);
    view.setIsFinalLevel(this._levels.isLast);
    this._subs.add(view.onAdvance(() => this._onAdvance()));
  }

  public destroy(): void {
    this._subs.flush();
    this._uiEvents = null;
    this._gameEvents = null;
    this._levels = null;
  }

  private _onAdvance(): void {
    this._uiEvents?.removeTopPopup();
    this._gameEvents?.emitAdvanceLevel();
  }
}
