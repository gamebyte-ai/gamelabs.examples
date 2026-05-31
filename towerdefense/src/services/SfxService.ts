import { AudioService } from "@gamebyte/gamelabsjs";

/**
 * Procedural SFX service for the tower defense game.
 *
 * All sounds are synthesised on the fly using the Web Audio API via the
 * core {@link AudioService}'s `sfxInput` node — no asset files needed.
 * Each method builds a short oscillator + gain envelope, fires once,
 * and is garbage-collected after the oscillator's `stop()` completes.
 *
 * Lives in `services/` because it's a boundary to the Web Audio API.
 */
export class SfxService {
  private readonly _audio: AudioService;

  public constructor(audio: AudioService) {
    this._audio = audio;
  }

  /** Archer fire — airy wind-like whoosh using filtered noise. */
  public playArcherFire(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;
    const dur = 0.12;

    // Noise source for the breathy whoosh
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    // Bandpass filter sweeps from high to mid for a descending wind feel
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(now);
    noise.stop(now + dur + 0.02);
  }

  /** Archer hit — deep solid thud/impact. */
  public playArcherHit(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;
    const dur = 0.1;

    // Low sine thump
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + dur);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.09, now + 0.004);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // Short noise layer for the "crack" on top
    const nDur = 0.04;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * nDur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.04, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + nDur);
    noise.connect(nGain);
    nGain.connect(dest);
    noise.start(now);
    noise.stop(now + nDur + 0.01);
  }

  /** Cannon launch — low punchy boom. */
  public playCannonLaunch(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;
    const dur = 0.15;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // Noise layer for crunch
    const noiseDur = 0.08;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.04, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur);
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(now);
    noise.stop(now + noiseDur + 0.01);
  }

  /** Cannon land — heavy explosive bomb impact. */
  public playCannonLand(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;

    // Sub-bass punch
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(80, now);
    sub.frequency.exponentialRampToValueAtTime(25, now + 0.25);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.0001, now);
    subG.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    subG.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    sub.connect(subG);
    subG.connect(dest);
    sub.start(now);
    sub.stop(now + 0.27);

    // Mid crunch
    const mid = ctx.createOscillator();
    mid.type = "sawtooth";
    mid.frequency.setValueAtTime(200, now);
    mid.frequency.exponentialRampToValueAtTime(50, now + 0.12);
    const midG = ctx.createGain();
    midG.gain.setValueAtTime(0.05, now);
    midG.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    mid.connect(midG);
    midG.connect(dest);
    mid.start(now);
    mid.stop(now + 0.14);

    // Long noise blast
    const nDur = 0.2;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * nDur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nG = ctx.createGain();
    nG.gain.setValueAtTime(0.07, now);
    nG.gain.exponentialRampToValueAtTime(0.0001, now + nDur);
    noise.connect(nG);
    nG.connect(dest);
    noise.start(now);
    noise.stop(now + nDur + 0.02);
  }

  /** Tesla zap — short electric crackle. */
  public playTeslaZap(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;
    const dur = 0.1;

    // High square wave buzz
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + dur);
    const oscG = ctx.createGain();
    oscG.gain.setValueAtTime(0.0001, now);
    oscG.gain.exponentialRampToValueAtTime(0.05, now + 0.003);
    oscG.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(oscG);
    oscG.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // Noise crackle
    const nDur = 0.06;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * nDur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nG = ctx.createGain();
    nG.gain.setValueAtTime(0.04, now);
    nG.gain.exponentialRampToValueAtTime(0.0001, now + nDur);
    noise.connect(nG);
    nG.connect(dest);
    noise.start(now);
    noise.stop(now + nDur + 0.01);
  }

  /** Ice freeze — frost crackle (filtered noise sweep down). */
  public playIceFreeze(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;
    const dur = 0.18;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(4000, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + dur);
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(now);
    noise.stop(now + dur + 0.02);
  }

  /** Laser hit — sci-fi beam pulse (high sine + resonant filter). */
  public playLaserHit(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;
    const dur = 0.08;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1000, now);
    filter.Q.value = 5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** Tower placement — satisfying mid-frequency thunk with resonance. */
  public playTowerPlace(): void {
    const g = this._begin();
    if (!g) return;
    const { ctx, dest, now } = g;
    const dur = 0.12;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // Resonant overtone
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(640, now);
    osc2.frequency.exponentialRampToValueAtTime(200, now + 0.06);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.03, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc2.connect(gain2);
    gain2.connect(dest);
    osc2.start(now);
    osc2.stop(now + 0.08);
  }

  private _begin(): { ctx: AudioContext; dest: AudioNode; now: number } | null {
    const ctx = this._audio.context;
    const dest = this._audio.sfxInput;
    if (!ctx || !dest) return null;
    if (ctx.state === "suspended") void ctx.resume();
    return { ctx, dest, now: ctx.currentTime };
  }
}
