import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";

import type { IFactoryScreenView } from "../views/IFactoryScreenView.js";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType, GameStatus } from "../models/IGameModel.js";
import { TimerModel } from "../models/TimerModel.js";
import { GameEvents } from "../events/GameEvents.js";
import { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import { TimeFormatter } from "../utilities/TimeFormatter.js";

/** HUD controller — reflects score/status/time onto the screen UI. */
export class FactoryScreenViewController implements IViewController<IFactoryScreenView> {
  private _view: IFactoryScreenView | null = null;
  private _model: IGameModelType | null = null;
  private _timer: TimerModel | null = null;
  private _events: GameEvents | null = null;
  private _config: FactoryMatchConfig | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _lastTime = "";
  private _lastTimeWarn = false;

  public inject(resolver: IInstanceResolver): void {
    this._model = resolver.getInstance(IGameModel);
    this._timer = resolver.getInstance(TimerModel);
    this._events = resolver.getInstance(GameEvents);
    this._config = resolver.getInstance(FactoryMatchConfig);
  }

  public initialize(view: IFactoryScreenView): void {
    this._view = view;
    view.setCash(this._model!.cash);
    this._applyStatus(this._model!.status);
    this._renderTime(this._timer!.elapsedSeconds);
    this._config!.goals.forEach((goal, i) => view.setGoal(i, goal.target));

    this._subs.add(this._events!.onCashChanged((n) => view.setCash(n)));
    this._subs.add(this._events!.onStatusChanged((s) => this._applyStatus(s)));
    this._subs.add(this._timer!.onChange((elapsed) => this._renderTime(elapsed)));
    this._subs.add(this._events!.onGoalChanged((i, remaining) => this._onGoalChanged(i, remaining)));
    this._subs.add(this._events!.onComboChanged((level, fill) => view.setCombo(level, fill)));
    this._subs.add(this._events!.onBoosterChanged((fan, spring) => view.setBoosterCharge(fan, spring)));
    this._subs.add(this._events!.onSpringPrompt(() => view.pulseSpringBooster()));
    this._subs.add(view.onFanTap(() => this._events!.emitFanActivated()));
    this._subs.add(view.onSpringTap(() => this._events!.emitSpringActivated()));
  }

  /** Update a goal's count and pop it to acknowledge the collection. */
  private _onGoalChanged(index: number, remaining: number): void {
    this._view!.setGoal(index, remaining);
    this._view!.pulseGoal(index);
  }

  /** Format remaining time and push it to the HUD, skipping same-second redraws. */
  private _renderTime(elapsed: number): void {
    const remaining = TimeFormatter.remaining(this._config!.time.startSeconds, elapsed);
    // Warn (red + blink) over the final seconds while still playing.
    const warn =
      this._model!.status === "playing" && remaining > 0 && remaining <= this._config!.hud.timerWarnSeconds;
    if (warn !== this._lastTimeWarn) {
      this._lastTimeWarn = warn;
      this._view!.setTimeWarning(warn);
    }
    const text = TimeFormatter.format(remaining);
    if (text === this._lastTime) return;
    this._lastTime = text;
    this._view!.setTime(text);
  }

  private _applyStatus(status: GameStatus): void {
    if (status !== "playing") {
      this._lastTimeWarn = false;
      this._view!.setTimeWarning(false); // stop the blink once the game ends
    }
    if (status === "won") this._view!.showResult("allClear");
    else if (status === "lost") this._view!.showResult(this._model!.lostReason === "time" ? "timeUp" : "gameOver");
    else {
      // Back to playing (initial or restart): clear the banner, reset goal counts,
      // and run the intro countdown; play begins when it finishes.
      this._view!.hideBanner();
      this._config!.goals.forEach((goal, i) => this._view!.setGoal(i, goal.target));
      this._view!.playCountdown(() => this._events!.emitStarted());
    }
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._model = null;
    this._timer = null;
    this._events = null;
    this._config = null;
  }
}
