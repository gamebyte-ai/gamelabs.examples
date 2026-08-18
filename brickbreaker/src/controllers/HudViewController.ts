import { UnsubscribeBag, UpdateManager, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IHudView } from "../views/IHudView";
import { BrickBreakerConfig } from "../BrickBreakerConfig";
import { GameEvents } from "../events/GameEvents";

/** Drives the round countdown off the UpdateManager tick: pushes the remaining
 * time (M:SS) to the HUD Time pill and, at zero, shows the game-over banner and
 * fires {@link GameEvents.emitGameOver} (which stops the board). */
export class HudViewController implements IViewController<IHudView> {
  private _view: IHudView | null = null;
  private _config: BrickBreakerConfig | null = null;
  private _updateManager: UpdateManager | null = null;
  private _events: GameEvents | null = null;
  private readonly _subs = new UnsubscribeBag();

  private _elapsed = 0;
  private _running = false;
  private _ended = false;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(BrickBreakerConfig);
    this._updateManager = resolver.getInstance(UpdateManager);
    this._events = resolver.getInstance(GameEvents);
  }

  public initialize(view: IHudView): void {
    this._view = view;
    const t = this._config!.time;
    view.setScore(this._config!.hud.score);
    view.setTime(this._fmt(t.durationSeconds));
    this._running = t.autoStart;
    this._subs.add(this._updateManager!.register((dt) => this._tick(dt)));
  }

  private _tick(dt: number): void {
    if (!this._running || this._ended) return;
    const duration = Math.max(0.001, this._config!.time.durationSeconds);
    this._elapsed = Math.min(duration, this._elapsed + dt);
    const remaining = duration - this._elapsed;
    this._view?.setTime(this._fmt(remaining));
    if (remaining <= 0) {
      this._ended = true;
      this._running = false;
      this._view?.showGameOver(this._config!.time.gameOverText);
      this._events?.emitGameOver();
    }
  }

  /** Seconds → "M:SS" (rounded UP so the last second shows before hitting 0). */
  private _fmt(s: number): string {
    const t = Math.max(0, Math.ceil(s));
    const m = Math.floor(t / 60);
    const sec = t % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._config = null;
    this._updateManager = null;
    this._events = null;
  }
}
