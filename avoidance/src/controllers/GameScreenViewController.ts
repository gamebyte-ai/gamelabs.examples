import { OnScreenControlManager, UnsubscribeBag, UIEvents, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "../views/IGameScreenView";
import { AvoidanceUIIds } from "../AvoidanceUIIds.js";
import { GameEvents } from "../events/GameEvents.js";

const WAVE_LABEL_ID = "wave";
const WAVE_ANNOUNCE_ID = "waveAnnounce";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private readonly _subs = new UnsubscribeBag();
  private _uiEvents: UIEvents | null = null;
  private _gameEvents: GameEvents | null = null;
  private _osc: OnScreenControlManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._uiEvents = resolver.getInstance(UIEvents);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._osc = resolver.getInstance(OnScreenControlManager);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;

    this._subs.add(this._gameEvents!.onWaveStarted((wave) => this._onWaveStarted(wave)));
    this._subs.add(this._gameEvents!.onWaveAnnounceEnded(() => this._osc?.setControlVisible(WAVE_ANNOUNCE_ID, false)));
    this._subs.add(this._gameEvents!.onGameOver(() => this._onGameOver()));
  }

  private _onWaveStarted(wave: number): void {
    this._osc?.setLabelText(WAVE_LABEL_ID, `WAVE ${wave}`);
    this._osc?.setLabelText(WAVE_ANNOUNCE_ID, `WAVE ${wave}`);
    this._osc?.setControlVisible(WAVE_ANNOUNCE_ID, true);
  }

  private _onGameOver(): void {
    this._osc?.setControlVisible(WAVE_ANNOUNCE_ID, false);
    this._uiEvents?.createPopup(AvoidanceUIIds.GameOverPopup);
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._uiEvents = null;
    this._gameEvents = null;
    this._osc = null;
  }
}
