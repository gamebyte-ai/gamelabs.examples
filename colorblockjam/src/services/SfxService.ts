import { AudioService } from "@gamebyte/gamelabsjs";

/**
 * Procedural SFX service for Color Block Jam.
 *
 * Every sound is synthesised at call-time from Web Audio oscillators +
 * a lazily-built noise buffer, so the example ships without any audio
 * assets. Peak gains are intentionally low (≤ 0.11) so rapid triggers
 * — pickup → drop → pickup during a flurry of drags — don't stack into
 * anything loud.
 *
 * Autoplay-policy: a Web Audio context starts `suspended` until the
 * first user gesture. Every playback call lazily resumes the context,
 * which is cheap when it's already running.
 *
 * This is a boundary to the Web Audio API (an external browser
 * subsystem that can fail because of the environment — suspended
 * context, autoplay policy, missing API in a headless environment),
 * so it lives in `services/` with the `*Service` suffix.
 */
export class SfxService {
  private readonly _audio: AudioService;
  private _noiseBuffer: AudioBuffer | null = null;

  public constructor(audio: AudioService) {
    this._audio = audio;
  }

  /**
   * Block pickup — a short, snappy Lego-style "snap": two fast
   * descending chirps layered with a tiny filtered-noise tick, all
   * wrapped in a ~100 ms gain envelope.
   */
  public playPickup(): void {
    const g = this._beginSfx();
    if (!g) return;
    const { ctx, dest, now } = g;
    const duration = 0.11;

    // Primary click — sine chirp from ~2 kHz down to ~900 Hz.
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(2100, now);
    osc1.frequency.exponentialRampToValueAtTime(900, now + duration);
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.09, now + 0.004);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc1.connect(gain1);
    gain1.connect(dest);
    osc1.start(now);
    osc1.stop(now + duration + 0.02);

    // Secondary body — lower sine that gives the snap a "plastic" feel.
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(520, now);
    osc2.frequency.exponentialRampToValueAtTime(320, now + duration);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.exponentialRampToValueAtTime(0.05, now + 0.006);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc2.connect(gain2);
    gain2.connect(dest);
    osc2.start(now);
    osc2.stop(now + duration + 0.02);

    // Tiny bandpass noise tick on top for the "click" highlight.
    this._playNoiseTick(ctx, dest, now, 0.035, 2600, 0.045);
  }

  /**
   * Block drop — a softer, lower Lego-style "tap". One short chirp plus
   * a very small filtered-noise tick, lower peak than pickup so it
   * reads as a settle rather than a snap.
   */
  public playDrop(): void {
    const g = this._beginSfx();
    if (!g) return;
    const { ctx, dest, now } = g;
    const duration = 0.1;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + duration + 0.02);

    this._playNoiseTick(ctx, dest, now, 0.025, 1400, 0.03);
  }

  /**
   * Gate shred — a ~450 ms Lego-shatter / crunch: broadband noise
   * filtered through a closing low-pass plus three offset click hits to
   * sell the "block being ground up by the gate" feel.
   */
  public playGateShred(): void {
    const g = this._beginSfx();
    if (!g) return;
    const { ctx, dest, now } = g;
    const duration = 0.45;

    // Noise crunch — low-pass sweeps down over the duration so the burst
    // starts bright and chews into a muddier thud.
    const noise = ctx.createBufferSource();
    noise.buffer = this._getNoiseBuffer(ctx);
    noise.loop = false;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(4200, now);
    lp.frequency.exponentialRampToValueAtTime(420, now + duration);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.11, now + 0.015);
    noiseGain.gain.exponentialRampToValueAtTime(0.04, now + duration * 0.55);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(now);
    noise.stop(now + duration + 0.02);

    // Three offset clicks to add texture — different pitches + times
    // scatter the cracks across the burst instead of one flat hiss.
    this._playClick(ctx, dest, now + 0.0, 900, 0.06);
    this._playClick(ctx, dest, now + 0.09, 1400, 0.05);
    this._playClick(ctx, dest, now + 0.22, 680, 0.045);

    // Low thump at the start gives the crunch some body.
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(140, now);
    thump.frequency.exponentialRampToValueAtTime(70, now + 0.18);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    thump.connect(thumpGain);
    thumpGain.connect(dest);
    thump.start(now);
    thump.stop(now + 0.25);
  }

  // --- internals ---------------------------------------------------------

  private _beginSfx(): { ctx: AudioContext; dest: AudioNode; now: number } | null {
    const ctx = this._audio.context;
    const dest = this._audio.sfxInput;
    if (!ctx || !dest) return null;
    if (ctx.state === "suspended") void ctx.resume();
    return { ctx, dest, now: ctx.currentTime };
  }

  private _getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this._noiseBuffer && this._noiseBuffer.sampleRate === ctx.sampleRate) {
      return this._noiseBuffer;
    }
    const seconds = 0.5;
    const length = Math.ceil(seconds * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buffer;
    return buffer;
  }

  private _playNoiseTick(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    centreFreq: number,
    peakGain: number,
  ): void {
    const noise = ctx.createBufferSource();
    noise.buffer = this._getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = centreFreq;
    bp.Q.value = 2.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(dest);
    noise.start(startTime);
    noise.stop(startTime + duration + 0.02);
  }

  private _playClick(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    frequency: number,
    peakGain: number,
  ): void {
    const duration = 0.07;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(frequency, startTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, startTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}
