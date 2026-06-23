/** Pure helpers for the HUD countdown label. `remaining` applies the start time
 * to elapsed seconds (clamped at zero); `format` renders seconds as mm:ss. */
export class TimeFormatter {
  public static remaining(startSeconds: number, elapsedSeconds: number): number {
    return Math.max(0, startSeconds - elapsedSeconds);
  }

  public static format(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return `${TimeFormatter._pad2(Math.floor(s / 60))}:${TimeFormatter._pad2(s % 60)}`;
  }

  private static _pad2(n: number): string {
    return n.toString().padStart(2, "0");
  }
}
