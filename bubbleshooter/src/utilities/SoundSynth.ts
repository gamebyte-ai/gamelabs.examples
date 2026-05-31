/**
 * Procedural SFX synthesis for Bubble Shooter.
 *
 * Each sound is rendered offline into an `AudioBuffer` using the
 * Web Audio API's sample-rate, then registered via the AssetManager
 * so the framework's `AudioService.playSfx` can play them by id.
 *
 * Why synth instead of shipping audio files: keeps the example
 * self-contained, lets us tune the timbre by editing this file, and
 * gives the pop SFX an exact sample-accurate envelope so combo
 * pitch-shifting via `playbackRate` lands cleanly.
 */
export class SoundSynth {
  /** Short cheerful "blup" — sine sweep down + AR envelope. */
  public static buildPop(ctx: AudioContext): AudioBuffer {
    const duration = 0.13;
    return SoundSynth._render(ctx, duration, (t, prev) => {
      const u = t / duration;
      // Sweep 760 → 280 Hz: starts bright and rounds out.
      const f = 760 - 480 * u;
      const phase = prev.phase + (2 * Math.PI * f) / ctx.sampleRate;
      // Quick attack (4 ms), exp decay (~45 ms tail).
      const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.045);
      const sine = Math.sin(phase);
      // Slight second harmonic for body.
      const harm = 0.18 * Math.sin(phase * 2);
      return { sample: 0.34 * env * (sine + harm), phase };
    });
  }

  /** Very short "tink" — high sine + tiny noise click. */
  public static buildSnap(ctx: AudioContext): AudioBuffer {
    const duration = 0.045;
    let lp = 0;
    return SoundSynth._render(ctx, duration, (t, prev) => {
      const u = t / duration;
      const f = 3200 - 700 * u;
      const phase = prev.phase + (2 * Math.PI * f) / ctx.sampleRate;
      const env = Math.exp(-t / 0.012);
      const noise = Math.random() * 2 - 1;
      lp = 0.45 * noise + 0.55 * lp;
      return { sample: 0.18 * env * (Math.sin(phase) * 0.7 + lp * 0.5), phase };
    });
  }

  /** Soft "pew" — sine sweep + airy noise tail. */
  public static buildShoot(ctx: AudioContext): AudioBuffer {
    const duration = 0.20;
    let lp = 0;
    return SoundSynth._render(ctx, duration, (t, prev) => {
      const u = t / duration;
      // Sweep 1100 → 280 Hz over the body of the sound.
      const f = 1100 * Math.exp(-3.5 * u) + 280;
      const phase = prev.phase + (2 * Math.PI * f) / ctx.sampleRate;
      const env = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.075);
      // Filtered noise gives the breathy "wh" attack.
      const noise = Math.random() * 2 - 1;
      lp = 0.3 * noise + 0.7 * lp;
      const noiseEnv = Math.exp(-t / 0.04) * 0.45;
      return { sample: 0.22 * env * Math.sin(phase) + noiseEnv * lp * 0.18, phase };
    });
  }

  /** Short "boom" — low sine sweep + thumpy noise burst. */
  public static buildBomb(ctx: AudioContext): AudioBuffer {
    const duration = 0.75;
    let lp = 0;
    let lp2 = 0;
    return SoundSynth._render(ctx, duration, (t, prev) => {
      // Rumble: 180 → 45 Hz.
      const f = 180 * Math.exp(-3.0 * t) + 45;
      const phase = prev.phase + (2 * Math.PI * f) / ctx.sampleRate;
      // Two-pole-ish lowpass over white noise → muffled boom body.
      const noise = Math.random() * 2 - 1;
      lp = 0.18 * noise + 0.82 * lp;
      lp2 = 0.18 * lp + 0.82 * lp2;
      const sineEnv = (1 - Math.exp(-t / 0.005)) * Math.exp(-t / 0.18);
      const noiseEnv = Math.exp(-t / 0.06) * 0.6;
      const sample = 0.55 * sineEnv * Math.sin(phase) + 0.45 * noiseEnv * lp2 * 4.0;
      return { sample: SoundSynth._softClip(sample), phase };
    });
  }

  /** Hissy "fwooosh" — bandpass-flavoured noise + slow envelope. */
  public static buildFireball(ctx: AudioContext): AudioBuffer {
    const duration = 0.55;
    let lp = 0;
    let prevNoise = 0;
    return SoundSynth._render(ctx, duration, (t, prev) => {
      // Bandpass: lowpass once, then subtract a slower-moving lowpass
      // (= highpass of the original). Roughly accents 800–2500 Hz.
      const noise = Math.random() * 2 - 1;
      lp = 0.55 * noise + 0.45 * lp;
      const hp = lp - prevNoise;
      prevNoise = lp;
      // Ramp in over ~80 ms, ride a plateau, decay over the back half.
      const attack = 1 - Math.exp(-t / 0.08);
      const decay = Math.exp(-Math.max(0, t - 0.18) / 0.18);
      const env = attack * decay;
      // Subtle low pitch drift adds a "moving" character.
      const f = 480 + 120 * Math.sin(2 * Math.PI * 2.5 * t);
      const phase = prev.phase + (2 * Math.PI * f) / ctx.sampleRate;
      const tone = 0.08 * Math.sin(phase);
      return { sample: 0.30 * env * (hp * 1.7 + tone), phase };
    });
  }

  /** Short "swish" — quick filtered-noise sweep with a faint pitch hint. */
  public static buildSwap(ctx: AudioContext): AudioBuffer {
    const duration = 0.12;
    let lp = 0;
    return SoundSynth._render(ctx, duration, (t, prev) => {
      const u = t / duration;
      const noise = Math.random() * 2 - 1;
      // Filter coefficient sweeps so the noise "opens up" then closes.
      const a = 0.35 + 0.4 * Math.sin(Math.PI * u);
      lp = a * noise + (1 - a) * lp;
      // Triangle envelope: rise + fall.
      const env = u < 0.4 ? u / 0.4 : Math.max(0, 1 - (u - 0.4) / 0.6);
      const f = 600 + 400 * (1 - u);
      const phase = prev.phase + (2 * Math.PI * f) / ctx.sampleRate;
      return { sample: 0.25 * env * (lp * 0.85 + Math.sin(phase) * 0.10), phase };
    });
  }

  private static _render(
    ctx: AudioContext,
    durationSec: number,
    sampleFn: (t: number, prev: { phase: number }) => { sample: number; phase: number },
  ): AudioBuffer {
    const sr = ctx.sampleRate;
    const numFrames = Math.max(1, Math.floor(durationSec * sr));
    const buffer = ctx.createBuffer(1, numFrames, sr);
    const data = buffer.getChannelData(0);
    const state = { phase: 0 };
    for (let i = 0; i < numFrames; i++) {
      const t = i / sr;
      const out = sampleFn(t, state);
      state.phase = out.phase;
      data[i] = out.sample;
    }
    return buffer;
  }

  /** Tanh-style soft-clip; tames the bomb's sub bass without harsh clipping. */
  private static _softClip(x: number): number {
    return Math.tanh(x);
  }
}
