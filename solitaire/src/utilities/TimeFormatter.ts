import type { TimeConfig, TimeDisplayFormat } from "../SolitaireConfig";

/**
 * Pure formatting helpers for the HUD time label. `displaySeconds`
 * applies the count direction ({@link TimeConfig.direction}) to the
 * elapsed value; `format` renders the resulting seconds value as the
 * configured string ({@link TimeConfig.displayFormat}).
 *
 * Splitting "what number to display" from "how to render it" keeps
 * the direction and format orthogonal — a count-down clock can show
 * `ss`, and a count-up clock can show `hh:mm:ss`, without either
 * caring about the other.
 */
export class TimeFormatter {
  public static displaySeconds(elapsedSeconds: number, config: TimeConfig): number {
    if (config.direction === "up") return config.startSeconds + elapsedSeconds;
    return Math.max(0, config.startSeconds - elapsedSeconds);
  }

  public static format(displaySeconds: number, format: TimeDisplayFormat): string {
    const s = Math.max(0, Math.floor(displaySeconds));
    switch (format) {
      case "mm:ss":
        return `${TimeFormatter.pad2(Math.floor(s / 60))}:${TimeFormatter.pad2(s % 60)}`;
      case "hh:mm:ss":
        return `${TimeFormatter.pad2(Math.floor(s / 3600))}:${TimeFormatter.pad2(Math.floor((s % 3600) / 60))}:${TimeFormatter.pad2(s % 60)}`;
      case "ss":
        return s.toString();
    }
  }

  private static pad2(n: number): string {
    return n.toString().padStart(2, "0");
  }
}
