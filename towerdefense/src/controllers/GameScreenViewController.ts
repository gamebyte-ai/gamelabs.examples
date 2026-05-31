import {
  AudioService,
  ISettingsModel,
  SettingsEvents,
  SettingsUIIds,
  UIEvents,
  UnsubscribeBag,
  UpdateManager,
  type IInstanceResolver,
  type ISettingsModel as ISettingsModelType,
  type IViewController,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { TowerDefenseUIIds } from "../TowerDefenseUIIds.js";
import { GameEvents } from "../events/GameEvents.js";
import { IGameState } from "../models/IGameState.js";
import { GameOperations } from "../utilities/GameOperations.js";
import { SfxService } from "../services/SfxService.js";
import { TOWER_TYPES } from "../constants/TowerTypeDef.js";
import type { IGameScreenView } from "../views/IGameScreenView.js";

export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _events: GameEvents | null = null;
  private _state: IGameState | null = null;
  private _ops: GameOperations | null = null;
  private _uiEvents: UIEvents | null = null;
  private _sfx: SfxService | null = null;
  private _audioService: AudioService | null = null;
  private _settingsModel: ISettingsModelType | null = null;
  private _settingsEvents: SettingsEvents | null = null;
  private _updateManager: UpdateManager | null = null;
  private _rebuildTimerUnsub: Unsubscribe | null = null;
  private _generating = false;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._events = resolver.getInstance(GameEvents);
    this._state = resolver.getInstance(IGameState);
    this._ops = resolver.getInstance(GameOperations);
    this._uiEvents = resolver.getInstance(UIEvents);
    this._sfx = resolver.getInstance(SfxService);
    this._audioService = resolver.getInstance(AudioService);
    this._settingsModel = resolver.getInstance(ISettingsModel);
    this._settingsEvents = resolver.getInstance(SettingsEvents);
    this._updateManager = resolver.getInstance(UpdateManager);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;

    view.updateGold(this._state!.gold);
    view.updateTowerAffordability(this._state!.gold);
    view.updateStats(this._state!.kills, this._state!.waveNumber);

    view.setGenerateLevelHandler(() => this._onGenerateLevel());

    view.setBuyTowerHandler((towerType) => {
      if (this._generating) return;
      const typeDef = TOWER_TYPES.get(towerType);
      if (!typeDef || !this._state) return;
      if (this._state.gold < typeDef.cost) return;
      this._events!.emitStartPlacement(towerType);
    });

    // Settings gear → settings popup
    this._subs.add(view.onSettingsTapped(() => this._uiEvents?.createPopup(SettingsUIIds.SettingsPopup)));

    // Tower placement → SFX + gold deduction
    this._subs.add(this._events!.onTowerPlaced((_col, _row, towerType) => this._onTowerPlaced(towerType)));

    // Gold changes (kills, passive income, purchases, level resets)
    this._subs.add(this._events!.onGoldChanged((total) => this._onGoldChanged(total)));

    // Stats (kills / wave) — state lives in GameState, updated via event
    this._subs.add(this._events!.onStatsChanged((kills, waveNumber) => this._view?.updateStats(kills, waveNumber)));

    // Settings changes → audio volume
    if (this._settingsEvents) {
      this._subs.add(this._settingsEvents.onValueChanged((name) => this._onSettingChanged(name)));
    }

    // Apply initial audio settings + resume context (browser autoplay policy)
    this._applyAllAudioSettings();
    this._audioService?.resume();
  }

  private _onTowerPlaced(towerType: number): void {
    const typeDef = TOWER_TYPES.get(towerType);
    if (!typeDef || !this._ops) return;
    this._ops.spendGold(typeDef.cost);
    this._sfx?.playTowerPlace();
  }

  private _onGoldChanged(total: number): void {
    if (!this._view) return;
    this._view.updateGold(total);
    this._view.updateTowerAffordability(total);
  }

  // ── Settings → Audio bridge ───────────────────────────────────────────

  private _applyAllAudioSettings(): void {
    if (!this._audioService || !this._settingsModel) return;
    this._audioService.setSfxMute(!this._settingsModel.getBooleanValue("sfx"));
    this._audioService.setSfxVolume(this._settingsModel.getNumberValue("sfxVolume") / 100);
  }

  private _onSettingChanged(name: string): void {
    if (!this._audioService || !this._settingsModel) return;
    if (name === "sfx") {
      this._audioService.setSfxMute(!this._settingsModel.getBooleanValue("sfx"));
    } else if (name === "sfxVolume") {
      this._audioService.setSfxVolume(this._settingsModel.getNumberValue("sfxVolume") / 100);
    }
  }

  // ── Level generation ──────────────────────────────────────────────────

  private _onGenerateLevel(): void {
    if (this._generating) return;
    if (!this._ops || !this._events || !this._uiEvents || !this._updateManager) return;

    this._generating = true;

    // Phase 1: synchronous teardown
    this._ops.teardownLevel();
    this._events.emitTeardownLevel();
    this._uiEvents.createPopup(TowerDefenseUIIds.GeneratingPopup);

    // Phase 2: deferred rebuild (~50ms safety gap, routed through the
    // UpdateManager so it gets cancelled cleanly if the controller is
    // destroyed mid-generation).
    let elapsed = 0;
    const GAP_SECONDS = 0.05;
    this._rebuildTimerUnsub = this._updateManager.register((dt) => {
      elapsed += dt;
      if (elapsed < GAP_SECONDS) return;
      const done = this._rebuildTimerUnsub;
      this._rebuildTimerUnsub = null;
      done?.();
      this._runRebuild();
    });
  }

  private _runRebuild(): void {
    try {
      this._ops!.startNewLevel();
      this._events!.emitLevelGenerated();
    } finally {
      this._uiEvents?.removeTopPopup();
      this._generating = false;
    }
  }

  public destroy(): void {
    this._rebuildTimerUnsub?.();
    this._rebuildTimerUnsub = null;
    this._view?.setGenerateLevelHandler(null);
    this._view?.setBuyTowerHandler(null);
    this._subs.flush();
    this._view = null;
    this._events = null;
    this._state = null;
    this._ops = null;
    this._uiEvents = null;
    this._sfx = null;
    this._audioService = null;
    this._settingsModel = null;
    this._settingsEvents = null;
    this._updateManager = null;
    this._generating = false;
  }
}
