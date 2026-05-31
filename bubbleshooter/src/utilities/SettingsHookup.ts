import {
  AudioService,
  ISettingsModel,
  SettingsEvents,
  UnsubscribeBag,
  type IInjectionTarget,
  type IInstanceResolver,
} from "@gamebyte/gamelabsjs";

const FIELD_SFX = "sfx";
const FIELD_SFX_VOLUME = "sfxVolume";

/**
 * Bridges the framework's Settings module to the bubble-shooter's
 * AudioService. Lives in `utilities/`, owns no view, holds no mutable
 * state — strictly a stateless event-routing strategy (role-named,
 * no `*Manager` suffix per AGENTS.md "Where logic lives"). Forwards
 * settings reads through the typed AudioService API; `sfxVolume`
 * is a 0–100 settings field while AudioService takes 0–1, so we
 * divide on the way out.
 *
 * Bubble shooter does not opt into `SettingsBinding({ audioFields:
 * true })` because that registers a `music` field the app never
 * uses. Defining only the `sfx` + `sfxVolume` fields the app cares
 * about + this bridge keeps the popup's row set tight.
 */
export class SettingsHookup implements IInjectionTarget {
  private readonly _subs = new UnsubscribeBag();
  private _settings: ISettingsModel | null = null;
  private _events: SettingsEvents | null = null;
  private _audio: AudioService | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._settings = resolver.getInstance(ISettingsModel);
    this._events = resolver.getInstance(SettingsEvents);
    this._audio = resolver.getInstance(AudioService);
  }

  public start(): void {
    this._applyAll();
    this._subs.add(
      this._events!.onValueChanged((name) => {
        if (name === FIELD_SFX || name === FIELD_SFX_VOLUME) this._applyAll();
      }),
    );
  }

  public destroy(): void {
    this._subs.flush();
    this._settings = null;
    this._events = null;
    this._audio = null;
  }

  private _applyAll(): void {
    const m = this._settings!;
    const audio = this._audio!;
    audio.setSfxMute(!m.getBooleanValue(FIELD_SFX));
    audio.setSfxVolume(m.getNumberValue(FIELD_SFX_VOLUME) / 100);
  }
}
