import { OnScreenControlManager, UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { GameEvents } from "../events/GameEvents";
import { GameOperations } from "../utilities/GameOperations";
import { BubbleShooterUIIds } from "../BubbleShooterUIIds";

/**
 * Thin screen-controller for the HUD: routes the score readout and
 * the dev-only level-dropdown change. The other HUD writes (bomb /
 * fireball counts, power-up button enable, win / game-over
 * overlays) are owned by `HudHookup` so this controller
 * stays under the AGENTS.md decomposition-signal threshold.
 */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _gameEvents: GameEvents | null = null;
  private _osc: OnScreenControlManager | null = null;
  private _ops: GameOperations | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._gameEvents = resolver.getInstance(GameEvents);
    this._osc = resolver.getInstance(OnScreenControlManager);
    this._ops = resolver.getInstance(GameOperations);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;
    const osc = this._osc!;
    this._subs.add(
      this._gameEvents!.onScoreChanged((value) => osc.setLabelText(BubbleShooterUIIds.ScoreLabel, `Score: ${value}`)),
    );
    this._subs.add(this._view.onLevelChanged((id) => this._ops?.loadLevel(id)));
    // Level changes mutate play-area dimensions, which re-routes the
    // power-up button offsets in `BubbleShooterApp._layoutPowerUpButtons`.
    // OnScreenControlsView only repositions on its own `resize`, so
    // poke it with the cached size after the App has updated configs.
    this._subs.add(this._gameEvents!.onLayoutChanged(() => this._view?.repositionOnScreenControls()));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameEvents = null;
    this._osc = null;
    this._ops = null;
  }
}
