import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import { BlockPuzzleConfig } from "../BlockPuzzleConfig";
import { GameState } from "../constants/GameState";
import { BoosterPanelState } from "../constants/BoosterPanelState";
import { BoosterType } from "../constants/BoosterType";
import { TrayEvents } from "../events/TrayEvents";
import { BoosterPanelModel } from "../models/BoosterPanelModel";
import { ComboModel } from "../models/ComboModel";
import { GameStateModel } from "../models/GameStateModel";
import { ScoreModel } from "../models/ScoreModel";
import { TimerModel } from "../models/TimerModel";
import { TrayPlaceabilityModel } from "../models/TrayPlaceabilityModel";
import { TimeFormatter } from "../utilities/TimeFormatter";
import type { IGameScreenView } from "../views/IGameScreenView";

// End-state text colours. Tints the centered label (which renders
// at white) so the rendered colour ends up as a clearly-different
// hue against the dark board background. Two independent end
// states: no-moves locks the player out via {@link GameState.GameOver};
// the countdown timer hitting zero hits {@link GameState.TimeUp}.
const GAME_OVER_COLOR = 0xff5555;
const GAME_OVER_TEXT = "NO MOVES LEFT";
const TIME_UP_COLOR = 0xff5555;
const TIME_UP_TEXT = "TIME UP!";

/**
 * HUD controller for the game screen. Subscribes to the score,
 * timer, game-state, combo, booster-panel, and tray-placeability
 * models; pushes their values into the view's render targets
 * (score / time labels, combo widget, booster panel, centered
 * end-state label).
 *
 * The booster panel's ready-state label ("CHOOSE ONE!" vs
 * "NO MOVES LEFT, USE BOOSTER!") depends on the cross-model
 * "is any tray piece placeable" signal, so the controller derives
 * it here (not in the view) and pushes the resolved string in
 * `BoosterPanelHudState.readyLabel`.
 *
 * Booster button taps route by type:
 * - Target-selection boosters (Hammer / UnitBlock) call
 *   `selectBooster(type)` — boards controller handles the cell-tap
 *   half of the mechanic.
 * - Instant boosters (TrayRefresh) run their mechanic inline (clear
 *   the tray + deal a fresh hand) and then `consume()`.
 * X tap on the floating cancel button calls `cancelSelection()`.
 */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _config: BlockPuzzleConfig | null = null;
  private _scoreModel: ScoreModel | null = null;
  private _timerModel: TimerModel | null = null;
  private _gameState: GameStateModel | null = null;
  private _comboModel: ComboModel | null = null;
  private _boosterPanel: BoosterPanelModel | null = null;
  private _placeability: TrayPlaceabilityModel | null = null;
  private _trayEvents: TrayEvents | null = null;
  private _updateManager: UpdateManager | null = null;
  private _lastTimeText = "";
  /** Combo loss shake — driven from `_onTick` while
   *  `_comboShakeTime !== null`. Tracks elapsed time within the
   *  shake; the previous moves-remaining catches the 1 → 0
   *  chain-break transition. */
  private _comboShakeTime: number | null = null;
  private _lastComboMovesRemaining = 0;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(BlockPuzzleConfig);
    this._scoreModel = resolver.getInstance(ScoreModel);
    this._timerModel = resolver.getInstance(TimerModel);
    this._gameState = resolver.getInstance(GameStateModel);
    this._comboModel = resolver.getInstance(ComboModel);
    this._boosterPanel = resolver.getInstance(BoosterPanelModel);
    this._placeability = resolver.getInstance(TrayPlaceabilityModel);
    this._trayEvents = resolver.getInstance(TrayEvents);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;

    if (this._scoreModel) {
      view.setScoreText(GameScreenViewController.formatScore(this._scoreModel.value));
      this._subs.add(this._scoreModel.onChange((v) => view.setScoreText(GameScreenViewController.formatScore(v))));
    }
    if (this._timerModel && this._config) {
      this.pushTimeText(view, this._timerModel.elapsedSeconds);
      this._subs.add(this._timerModel.onChange((elapsed) => this.pushTimeText(view, elapsed)));
    }
    if (this._gameState) {
      view.setEndStateLabel(this.endStateLabelFor(this._gameState.state));
      this._subs.add(this._gameState.onStateChanged((state) => this.onGameStateChanged(state)));
    }
    if (this._comboModel) {
      this._lastComboMovesRemaining = this._comboModel.movesRemaining;
      view.setComboState({ level: this._comboModel.level, movesRemaining: this._comboModel.movesRemaining });
      this._subs.add(this._comboModel.onChange((m) => this.onComboChanged(m.level, m.movesRemaining)));
    }
    if (this._boosterPanel) {
      this.pushBoosterPanelState(view);
      this._subs.add(this._boosterPanel.onChange(() => this.pushBoosterPanelState(view)));
      if (this._placeability) {
        this._subs.add(this._placeability.onChange(() => this.pushBoosterPanelState(view)));
      }
      this._subs.add(view.onBoosterActivated((type) => this.handleBoosterTap(type)));
      this._subs.add(view.onBoosterCancelled(() => this._boosterPanel?.cancelSelection()));
    }
    if (this._updateManager) {
      this._subs.add(this._updateManager.register((dt) => this._onTick(dt)));
    }
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._config = null;
    this._scoreModel = null;
    this._timerModel = null;
    this._gameState = null;
    this._comboModel = null;
    this._boosterPanel = null;
    this._placeability = null;
    this._trayEvents = null;
    this._updateManager = null;
    this._lastTimeText = "";
    this._comboShakeTime = null;
    this._lastComboMovesRemaining = 0;
  }

  /**
   * Combo state transition handler. Pushes the new state to the
   * view and detects the chain-break (1 → 0 movesRemaining) to
   * trigger the loss shake. A clear-driven decrement still ends
   * up at 0 only after intervening clears reset the counter, so
   * the 1 → 0 transition exclusively catches no-clear breaks.
   */
  private onComboChanged(level: number, movesRemaining: number): void {
    if (this._view === null) return;
    this._view.setComboState({ level, movesRemaining });
    const broke = this._lastComboMovesRemaining === 1 && movesRemaining === 0;
    this._lastComboMovesRemaining = movesRemaining;
    if (broke) this._comboShakeTime = 0;
  }

  /**
   * Per-frame tick — drives the combo loss shake while
   * `_comboShakeTime !== null`. Offset is a decaying sinusoid:
   * `amp · (1 - t/duration) · sin(2π · f · t)`. End-of-shake snaps
   * the circles back to zero offset.
   */
  private _onTick(dt: number): void {
    if (this._comboShakeTime === null || this._view === null || this._config === null) return;
    const cfg = this._config.combo.lossShake;
    this._comboShakeTime += dt;
    if (this._comboShakeTime >= cfg.durationSeconds) {
      this._comboShakeTime = null;
      this._view.setComboShakeOffset(0);
      return;
    }
    const t = this._comboShakeTime;
    const decay = 1 - t / cfg.durationSeconds;
    const offset = cfg.amplitude * decay * Math.sin(2 * Math.PI * cfg.frequencyHz * t);
    this._view.setComboShakeOffset(offset);
  }

  /**
   * Push the booster panel snapshot to the view. Includes the
   * ready-state label (derived from booster state + cross-model
   * placeability) and the selected booster (for the scaled-up
   * visual + floating cancel button).
   */
  /**
   * Game-state transition (Playing → GameOver / TimeUp). Flip the
   * centered overlay label, then re-push the booster panel state so
   * the ready-label suppression off-Playing takes effect on the
   * same tick (otherwise "NO MOVES LEFT, USE BOOSTER!" can leak
   * through after a TIME UP).
   */
  private onGameStateChanged(state: GameState): void {
    if (this._view === null) return;
    // Auto-exit any pending Selecting on terminal transition. The
    // resulting `BoosterPanelModel.cancelSelection()` fires its own
    // onChange → pushBoosterPanelState, but the post-cancel state
    // (Ready, no selectedBooster) is still pushed as `disabled`
    // because gameState is now terminal.
    if (state !== GameState.Playing && this._boosterPanel?.state === BoosterPanelState.Selecting) {
      this._boosterPanel.cancelSelection();
    }
    this._view.setEndStateLabel(this.endStateLabelFor(state));
    this.pushBoosterPanelState(this._view);
  }

  private pushBoosterPanelState(view: IGameScreenView): void {
    if (!this._boosterPanel || !this._config) return;
    const cfg = this._config.booster;
    // Ready-label is only meaningful while in Playing. After an end
    // state ("NO MOVES LEFT, USE BOOSTER!" must not show post-TIME
    // UP — TimeUp is its own terminal condition independent from
    // no-moves), suppress the label entirely. The centered overlay
    // takes the focus.
    const isPlaying = this._gameState === null || this._gameState.state === GameState.Playing;
    let readyLabel: string | null = null;
    if (isPlaying && this._boosterPanel.state === BoosterPanelState.Ready) {
      const hasPlaceable = this._placeability?.hasPlaceable ?? true;
      readyLabel = hasPlaceable ? cfg.readyLabelChooseOne : cfg.readyLabelNoMoves;
    }
    view.setBoosterPanelState({
      state: this._boosterPanel.state,
      stagesFilled: this._boosterPanel.stagesFilled,
      readyLabel,
      selectedBooster: this._boosterPanel.selectedBooster,
      disabled: !isPlaying,
    });
    // Booster-selecting instruction in the combo widget's slot. Only
    // the two target-selection boosters surface a prompt; instant
    // boosters never reach Selecting. Off-Playing transitions clear
    // the prompt for the same reason readyLabel is suppressed.
    let prompt: string | null = null;
    if (isPlaying && this._boosterPanel.state === BoosterPanelState.Selecting) {
      if (this._boosterPanel.selectedBooster === BoosterType.Hammer) {
        prompt = cfg.selectingPromptHammer;
      } else if (this._boosterPanel.selectedBooster === BoosterType.UnitBlock) {
        prompt = cfg.selectingPromptUnitBlock;
      }
    }
    view.setBoosterPrompt(prompt);
  }

  /**
   * Route a booster-button tap by type. From Ready: target-selection
   * boosters flip the model to Selecting; instant boosters run their
   * mechanic inline and consume the activation in one shot. From
   * Selecting: a tap on the currently-selected booster is equivalent
   * to tapping the X — it cancels the selection.
   */
  private handleBoosterTap(type: BoosterType): void {
    if (this._boosterPanel === null) return;
    // Defensive guard — the view already gates `eventMode` off
    // post-terminal, but a tap mid-transition could still land
    // here. Drop any activation while the game is over.
    if (this._gameState !== null && this._gameState.state !== GameState.Playing) return;
    if (
      this._boosterPanel.state === BoosterPanelState.Selecting &&
      this._boosterPanel.selectedBooster === type
    ) {
      this._boosterPanel.cancelSelection();
      return;
    }
    if (this._boosterPanel.state !== BoosterPanelState.Ready) return;
    if (type === BoosterType.TrayRefresh) {
      // Consume first (transitions Charging) so the boosters are
      // visibly inert during the exit slide. The boards controller
      // owns the tray view + animation pipeline, so the refresh
      // sequence (exit slide → model clear → deal → entry slide)
      // is orchestrated there via `TrayEvents.onRefreshRequested`.
      this._boosterPanel.consume();
      this._trayEvents?.requestRefresh();
    } else {
      this._boosterPanel.selectBooster(type);
    }
  }

  /**
   * Resolve elapsed seconds through the configured direction +
   * format, dedupe redundant updates (the underlying timer fires
   * every step but `mm:ss` only changes once per wall-clock second).
   *
   * Doubles as the zero-detection point for count-down mode: once
   * the displayed seconds hits zero while still Playing, transition
   * to TimeUp so the timer freezes (App's onStep gates ticks on
   * Playing) and the "TIME UP!" overlay shows. TimeUp is independent
   * from the no-moves GameOver — neither overwrites the other (both
   * sites guard on `state === Playing`).
   */
  private pushTimeText(view: IGameScreenView, elapsed: number): void {
    if (!this._config) return;
    const seconds = TimeFormatter.displaySeconds(elapsed, this._config.time);
    const text = TimeFormatter.format(seconds, this._config.time.displayFormat);
    if (text !== this._lastTimeText) {
      this._lastTimeText = text;
      view.setTimeText(text);
    }
    if (
      this._config.time.direction === "down" &&
      seconds <= 0 &&
      this._gameState !== null &&
      this._gameState.state === GameState.Playing
    ) {
      this._gameState.setState(GameState.TimeUp);
    }
  }

  private endStateLabelFor(state: GameState): { readonly text: string; readonly color: number } | null {
    switch (state) {
      case GameState.GameOver:
        return { text: GAME_OVER_TEXT, color: GAME_OVER_COLOR };
      case GameState.TimeUp:
        return { text: TIME_UP_TEXT, color: TIME_UP_COLOR };
      default:
        return null;
    }
  }

  private static formatScore(value: number): string {
    return `Score: ${value}`;
  }
}
