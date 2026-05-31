import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { UndoEvents } from "../events/UndoEvents";
import { ScoreModel } from "../models/ScoreModel";
import { TimerModel } from "../models/TimerModel";
import { GameStateModel } from "../models/GameStateModel";
import { GameState } from "../constants/GameState";
import { GameSettingsEvents } from "../events/GameSettingsEvents";
import { TimeFormatter } from "../utilities/TimeFormatter";
import { SolitaireConfig } from "../SolitaireConfig";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _undoEvents: UndoEvents | null = null;
  private _scoreModel: ScoreModel | null = null;
  private _timerModel: TimerModel | null = null;
  private _gameState: GameStateModel | null = null;
  private _settingsEvents: GameSettingsEvents | null = null;
  private _config: SolitaireConfig | null = null;
  private _lastTimeText = "";
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._undoEvents = resolver.getInstance(UndoEvents);
    this._scoreModel = resolver.getInstance(ScoreModel);
    this._timerModel = resolver.getInstance(TimerModel);
    this._gameState = resolver.getInstance(GameStateModel);
    this._settingsEvents = resolver.getInstance(GameSettingsEvents);
    this._config = resolver.getInstance(SolitaireConfig);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;
    this._subs.add(view.onUndoClicked(() => this._undoEvents?.request()));

    if (this._scoreModel) {
      view.setScoreText(this.formatScore(this._scoreModel.value));
      this._subs.add(this._scoreModel.onChange((value) => view.setScoreText(this.formatScore(value))));
    }
    if (this._timerModel) {
      this.pushTimeText(view, this._timerModel.elapsedSeconds);
      this._subs.add(this._timerModel.onChange((elapsed) => this.pushTimeText(view, elapsed)));
    }
    if (this._gameState) {
      view.setEndStateLabel(this.endStateLabelFor(this._gameState.state));
      this._subs.add(this._gameState.onStateChanged((state) => view.setEndStateLabel(this.endStateLabelFor(state))));
    }

    // Turn-mode radio group: seed the initial selection from the
    // config, then forward subsequent user picks into the shared
    // GameSettingsEvents (which SolitaireApp acts on by restarting
    // the level with the new draw count).
    if (this._config) {
      view.setDrawCountMode(this._config.drawCount);
    }
    if (this._settingsEvents) {
      this._subs.add(view.onDrawCountSelected((drawCount) => this._settingsEvents?.requestModeChange(drawCount)));
    }
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._undoEvents = null;
    this._scoreModel = null;
    this._timerModel = null;
    this._gameState = null;
    this._settingsEvents = null;
    this._config = null;
    this._lastTimeText = "";
  }

  private formatScore(value: number): string {
    return `Score: ${value}`;
  }

  /**
   * Resolve the elapsed time through the configured direction +
   * format, then push to the view only when the rendered string
   * actually changes. `TimerModel.tick` fires every simulation step
   * (60Hz); the rendered mm:ss only changes once per wall-clock
   * second, so deduping here saves a PIXI.Text rebuild on most ticks.
   *
   * Also serves as the zero-detection point for count-down mode:
   * once the resolved display value reaches zero while in the
   * Playing state, flip the game state to TimeOver. SolitaireApp's
   * onStep then stops feeding the timer. A losing state, when added,
   * would transition from Playing elsewhere and would not pass
   * through this handler.
   */
  private pushTimeText(view: IGameScreenView, elapsed: number): void {
    if (!this._config) return;
    const seconds = TimeFormatter.displaySeconds(elapsed, this._config.time);
    const text = TimeFormatter.format(seconds, this._config.time.displayFormat);
    if (text !== this._lastTimeText) {
      this._lastTimeText = text;
      view.setTimeText(text);
    }
    if (this._config.time.direction === "down" && seconds <= 0 && this._gameState !== null && this._gameState.state === GameState.Playing) {
      this._gameState.setState(GameState.TimeOver);
    }
  }

  /**
   * Maps a terminal game state to its HUD label text + colour.
   * Returns null for non-terminal states (Dealing / Playing), which
   * hides the label. Time-out reads in red; a completed game reads
   * in foundation-green. Future end states (e.g. an explicit losing
   * condition) branch in here without touching the view.
   */
  private endStateLabelFor(state: GameState): { readonly text: string; readonly color: number } | null {
    switch (state) {
      case GameState.TimeOver:
        return { text: "Time is Over", color: 0xff5555 };
      case GameState.Won:
        return { text: "You Win!", color: 0x4ae28a };
      default:
        return null;
    }
  }
}
