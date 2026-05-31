import { UnsubscribeBag, UIEvents, AudioService, ISettingsModel, SettingsEvents, SettingsUIIds, StorageService, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import { GameEvents } from "../events/GameEvents.js";
import { IGameModel } from "../models/IGameModel.js";
import type { IGameModel as IGameModelType } from "../models/IGameModel.js";
import { GameOperations } from "../utilities/GameOperations.js";
import type { IGameScreenView } from "../views/IGameScreenView.js";

const BEST_STORAGE_KEY = "best";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _gameModel: IGameModelType | null = null;
  private _gameEvents: GameEvents | null = null;
  private _uiEvents: UIEvents | null = null;
  private _audioService: AudioService | null = null;
  private _settingsModel: ISettingsModel | null = null;
  private _settingsEvents: SettingsEvents | null = null;
  private _storage: StorageService | null = null;
  private _operations: GameOperations | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._gameModel = resolver.getInstance(IGameModel);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._uiEvents = resolver.getInstance(UIEvents);
    this._audioService = resolver.getInstance(AudioService);
    this._settingsModel = resolver.getInstance(ISettingsModel);
    this._settingsEvents = resolver.getInstance(SettingsEvents);
    this._storage = resolver.getInstance(StorageService);
    this._operations = resolver.getInstance(GameOperations);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;

    const storedBest = this._storage?.load<number>(BEST_STORAGE_KEY) ?? 0;
    if (storedBest > 0) this._operations?.setBest(storedBest);

    view.setScore(this._gameModel?.score ?? 0);
    view.setBest(this._gameModel?.best ?? 0);
    view.showGameOver(false);

    this._subs.add(this._gameEvents?.onScoreChanged((score) => this._view?.setScore(score)));
    this._subs.add(this._gameEvents?.onBestChanged((best) => this._onBestChanged(best)));
    this._subs.add(this._gameEvents?.onGameOver(() => this._view?.showGameOver(true)));
    this._subs.add(this._gameEvents?.onPlaySfx((sfxId) => this._audioService?.playSfx(sfxId)));
    this._subs.add(view.onSettingsTapped(() => this._uiEvents?.createPopup(SettingsUIIds.SettingsPopup)));
    this._subs.add(view.onRestartTapped(() => this._onRestartTapped()));
    this._subs.add(this._settingsEvents?.onValueChanged((name) => this._applyAudioSetting(name)));

    this._applyAllAudioSettings();
    this._audioService?.resume();
  }

  private _onBestChanged(best: number): void {
    this._view?.setBest(best);
    this._storage?.save(BEST_STORAGE_KEY, best);
  }

  private _onRestartTapped(): void {
    this._view?.showGameOver(false);
    this._gameEvents?.emitRestartTapped();
  }

  private _applyAudioSetting(name: string): void {
    if (!this._audioService || !this._settingsModel) return;
    switch (name) {
      case "sfx":
        this._audioService.setSfxMute(!this._settingsModel.getBooleanValue("sfx"));
        break;
      case "sfxVolume":
        this._audioService.setSfxVolume(this._settingsModel.getNumberValue("sfxVolume") / 100);
        break;
    }
  }

  private _applyAllAudioSettings(): void {
    this._applyAudioSetting("sfx");
    this._applyAudioSetting("sfxVolume");
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._gameModel = null;
    this._gameEvents = null;
    this._uiEvents = null;
    this._audioService = null;
    this._settingsModel = null;
    this._settingsEvents = null;
    this._storage = null;
    this._operations = null;
  }
}
