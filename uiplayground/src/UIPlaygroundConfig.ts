import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * Tuning surface for the UI Components Playground shell. Pure data —
 * region sizes and colors used by `PlaygroundShellView`. Demo-specific
 * tuning lives inside each demo; this file describes only the shell.
 */
export class UIPlaygroundConfig {
  // ─── Region sizing ──────────────────────────────────────────────────
  /** Sidebar width in pixels (left column, full height). */
  public readonly sidebarWidth = 220;
  /** Controls panel width in pixels (right column, full height). */
  public readonly controlsWidth = 380;
  /** Event log height in pixels (bottom of the centre column). */
  public readonly logHeight = 160;
  /** Inner padding inside every region (sidebar / stage / controls / log). */
  public readonly regionPadding = 14;
  /** Vertical gap between sidebar sections (Component / Module / Composition). */
  public readonly sidebarSectionGap = 6;
  /** Height of a single sidebar item button. */
  public readonly sidebarItemHeight = 32;

  // ─── Region backgrounds ─────────────────────────────────────────────
  public readonly sidebarBgColor = 0x172533;
  public readonly stageBgColor = 0x3d3d3d;
  public readonly controlsBgColor = 0x1c2a38;
  public readonly logBgColor = 0x05080d;

  // ─── Sidebar item styling ───────────────────────────────────────────
  public readonly sidebarHeaderColor = 0x64748b;
  public readonly sidebarItemBgColor = 0x1e293b;
  public readonly sidebarItemBorderColor = 0x334155;
  public readonly sidebarItemColor = 0xe8eef6;
  /** Accent color drawn on the left edge of the active sidebar item. */
  public readonly sidebarActiveColor = 0x4ade80;

  // ─── Log styling ────────────────────────────────────────────────────
  public readonly logTextColor = 0xa3e635;
  /** Maximum number of log lines kept on screen — older lines are dropped. */
  public readonly logBufferSize = 8;

  // ─── Outline (debug) ───────────────────────────────────────────────
  /** Color of the debug outline drawn around the active demo's component. */
  public readonly outlineColor = 0xffffff;
  /** Stroke width of the debug outline, in pixels. */
  public readonly outlineWidth = 2;

  public readonly transitions: { readonly screenEnter: ScreenTransition } = {
    screenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0,
    },
  };
}
