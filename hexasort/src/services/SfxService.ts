import { AudioService } from "@gamebyte/gamelabsjs";

/**
 * Tiny procedural SFX service for the Hexasort example.
 *
 * No asset files, no loading — each method builds a short oscillator +
 * gain envelope directly on the core {@link AudioService}'s `sfxInput`,
 * fires once, and is garbage-collected after the oscillator's `stop()`
 * completes. Peaks are intentionally low (≤ 0.09 gain) so cascades of
 * destruction pops don't stack into something loud.
 *
 * Autoplay-policy: a Web Audio context starts `suspended` until the
 * first user gesture. Every playback call lazily resumes the context —
 * cheap when it is already running.
 *
 * Lives in `services/` (not `utilities/`) because it is a boundary to
 * the Web Audio API — it constructs browser AudioNodes and can fail
 * because of the environment (suspended context, autoplay policy).
 * Browser/OS-API boundaries belong in `services/` with the `*Service`
 * suffix.
 */
export class SfxService {
  private readonly _audio: AudioService;

  public constructor(audio: AudioService) {
    this._audio = audio;
  }

  /** Sound 1: light whoosh/tick at a tile's start of flight. */
  public playMoveStart(): void {
    const g = this._beginSfx();
    if (!g) return;
    const { ctx, dest, now } = g;
    const duration = 0.09;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Sound 2: grounded thud/click as a tile settles onto the target stack. */
  public playTileLand(): void {
    const g = this._beginSfx();
    if (!g) return;
    const { ctx, dest, now } = g;
    const duration = 0.11;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Sound 3: minimal pop/ping per destroyed tile — cascades cleanly. */
  public playTileDestroy(): void {
    const g = this._beginSfx();
    if (!g) return;
    const { ctx, dest, now } = g;
    const duration = 0.08;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(820, now);
    osc.frequency.exponentialRampToValueAtTime(1550, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private _beginSfx(): { ctx: AudioContext; dest: AudioNode; now: number } | null {
    const ctx = this._audio.context;
    const dest = this._audio.sfxInput;
    if (!ctx || !dest) return null;
    if (ctx.state === "suspended") void ctx.resume();
    return { ctx, dest, now: ctx.currentTime };
  }
}
