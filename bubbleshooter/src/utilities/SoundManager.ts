import { AudioService, UnsubscribeBag, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { GameEvents } from "../events/GameEvents";
import { BubbleShooterAssetIds } from "../BubbleShooterAssetIds";

/**
 * Owns the SFX-bus state for Bubble Shooter and wires GameEvents →
 * AudioService.playSfx. Lives in `utilities/` per the "Where logic
 * lives" table — it owns mutable subsystem state (the rolling combo
 * counter) but never talks to the outside world directly; the
 * AudioService is the boundary.
 *
 * Combo pop pitch: each pop within a short rolling window bumps the
 * playback rate by a fixed step so chained pops climb in pitch.
 * Resets when no pop is heard for {@link COMBO_RESET_MS}.
 */
const COMBO_RESET_MS = 250;
const COMBO_RATE_STEP = 0.07;
const COMBO_RATE_MAX = 1.9;

export class SoundManager implements IInjectionTarget {
  private readonly _subs = new UnsubscribeBag();
  private _audio: AudioService | null = null;
  private _events: GameEvents | null = null;
  private _popCombo = 0;
  private _lastPopAt = 0;

  public inject(resolver: IInstanceResolver): void {
    this._audio = resolver.getInstance(AudioService);
    this._events = resolver.getInstance(GameEvents);
  }

  public start(): void {
    const e = this._events!;
    this._subs.add(e.onBubblePopped(() => this._onPop()));
    this._subs.add(e.onBubbleSnapped((_r, _c) => this._play(BubbleShooterAssetIds.SoundSnap)));
    this._subs.add(e.onBubbleShotFired(() => this._play(BubbleShooterAssetIds.SoundShoot)));
    this._subs.add(e.onBombExploded(() => this._play(BubbleShooterAssetIds.SoundBomb)));
    this._subs.add(e.onFireballFired(() => this._play(BubbleShooterAssetIds.SoundFireball)));
    this._subs.add(e.onShooterSwap(() => this._play(BubbleShooterAssetIds.SoundSwap)));
  }

  public destroy(): void {
    this._subs.flush();
    this._audio = null;
    this._events = null;
  }

  private _onPop(): void {
    const now = performance.now();
    if (now - this._lastPopAt > COMBO_RESET_MS) this._popCombo = 0;
    this._lastPopAt = now;
    const rate = Math.min(COMBO_RATE_MAX, 1 + this._popCombo * COMBO_RATE_STEP);
    this._popCombo++;
    this._play(BubbleShooterAssetIds.SoundPop, rate);
  }

  /**
   * Resume the AudioContext (browsers start it suspended until a
   * user gesture) and play. Calling `resume()` on every play is
   * cheap and avoids needing a separate "first-gesture" hook.
   */
  private _play(assetId: string, rate = 1): void {
    if (!this._audio) return;
    this._audio.resume();
    this._audio.playSfx(assetId, { rate });
  }
}
