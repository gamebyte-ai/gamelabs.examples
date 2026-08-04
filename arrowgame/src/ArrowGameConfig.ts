import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/** @panelConfig */
export class ArrowGameConfig {
  /** @panel {"type":"string","label":"Title","default":"Arrow Escape"} */
  public readonly title = "Arrow Escape";

  // --- Level label (top-center "LEVEL n" text) ---
  /** @panel {"type":"number","label":"Level Label Size","min":10,"max":48,"step":1,"group":"HUD","default":18} */
  public readonly levelLabelSize = 18;
  /** @panel {"type":"color","label":"Level Label Color","group":"HUD","default":"#3a3550"} */
  public readonly levelLabelColor = 0x3a3550;
  /** Vertical offset of the label below the top safe area, in px. */
  /** @panel {"type":"number","label":"Level Label Top","min":0,"max":120,"step":2,"group":"HUD","default":8} */
  public readonly levelLabelTop = -20;

  /** TEST/DEBUG: which level to open on boot (1-based, as shown in the HUD).
   * Set to 1 to always start at Level 1; bump it to test a specific level.
   * Clamped to the valid range at load time. */
  /** @panel {"type":"number","label":"Start Level (test)","min":1,"max":99,"step":1,"group":"Debug","default":2} */
  public readonly startLevel = 3;

  /** How fast an arrow slides out (grid cells per second). */
  /** @panel {"type":"number","label":"Slide speed","min":4,"max":30,"step":1,"group":"Feel","default":14} */
  public readonly slideSpeed = 14;
  /** Shake animation duration (seconds) when a move is blocked. */
  public readonly shakeDuration = 0.3;
  /** Shake intensity — nudge amplitude as a fraction of a cell's pixel size. */
  /** @panel {"type":"number","label":"Shake Intensity","min":0,"max":0.6,"step":0.02,"group":"Feel","default":0.14} */
  public readonly shakeAmplitudeRatio = 0.05;
  /** When the obstacle is directly ADJACENT (no empty gap), how far the arrow
   * lunges toward the obstacle cell's center before bouncing back, as a fraction
   * of a cell (0 = no lunge → plain shake). */
  /** @panel {"type":"number","label":"Bump Distance","min":0,"max":0.9,"step":0.02,"group":"Feel","default":0.45} */
  public readonly bumpDistanceRatio = 0.45;

  /** Single color for ALL arrow lines (heads + bodies). */
  /** @panel {"type":"color","label":"Arrow Color","group":"Look","default":"#000000"} */
  public readonly arrowColor = 0x000000;

  /** Gradient background — top and bottom colors (vertical blend). */
  /** @panel {"type":"color","label":"Background Top","group":"Look","default":"#f2f3f5"} */
  public readonly bgGradientTop = 0xf0f8fe;
  /** @panel {"type":"color","label":"Background Bottom","group":"Look","default":"#8b9198"} */
  public readonly bgGradientBottom = 0xcdedfa;

  /** Palette used for arrows (indexed by the arrow's colorIndex). Currently unused
   * — all arrows share `arrowColor`. Kept for future per-arrow coloring. */
  public readonly arrowColors: readonly number[] = [
    0xff5a5f, // red
    0x5c70fd, // blue & purple
    0xffcf3f, // yellow
    0x5bd670, // green
    0xff934a, // orange
  ];

  // --- 2D drawing (pixi) ---
  /** Arrow line thickness as a fraction of a cell's pixel size (1 = fills a cell). */
  /** @panel {"type":"number","label":"Arrow Line Thickness","min":0.1,"max":1,"step":0.02,"group":"Look","default":0.52} */
  public readonly arrowThicknessRatio = 0.15;
  /** Grid dot radius as a fraction of a cell's pixel size. */
  /** @panel {"type":"number","label":"Grid Dot Size","min":0,"max":0.3,"step":0.01,"group":"Look","default":0.07} */
  public readonly dotRadiusRatio = 0.054;
  /** Grid dot color. */
  public readonly dotColor = 0xcfd1e2;
  /** Arrowhead size as a fraction of a cell's pixel size (scales the head sprite). */
  /** @panel {"type":"number","label":"Arrow Head Size","min":0.2,"max":1.5,"step":0.02,"group":"Look","default":0.62} */
  public readonly arrowSizeRatio = 0.4;
  /** How far the arrowhead sits AHEAD of the head cell's center, toward the arrow's
   * travel direction, as a fraction of a cell (0 = dead center, + = pushed forward). */
  /** @panel {"type":"number","label":"Arrow Head Offset","min":-0.5,"max":0.5,"step":0.02,"group":"Look","default":0.25} */
  public readonly arrowHeadOffsetRatio = 0.32;
  /** Fraction of the shorter screen side the board may occupy (padding around it). */
  public readonly boardFitRatio = 0.86;
  /** Vertical nudge of the whole grid, in px (− up / + down). Clamped so the board
   * stays fully on screen when it fits. */
  /** @panel {"type":"number","label":"Board Y Offset","min":-300,"max":300,"step":4,"group":"Look","default":0} */
  public readonly boardYOffset = 90;

  // --- Letterbox: clamp the visible play area to an aspect range (width ÷ height).
  // Screens NARROWER than min (taller) get top/bottom bars; screens WIDER than max
  // get left/right bars. Inside the range the play area fills the screen.
  /** @panel {"type":"number","label":"Letterbox Min Aspect","min":0.3,"max":1.2,"step":0.01,"group":"Layout","default":0.45} */
  public readonly letterboxMinAspect = 0.39;
  /** @panel {"type":"number","label":"Letterbox Max Aspect","min":0.6,"max":3,"step":0.01,"group":"Layout","default":1.8} */
  public readonly letterboxMaxAspect = 2.57;
  /** @panel {"type":"color","label":"Letterbox Color","group":"Layout","default":"#000000"} */
  public readonly letterboxColor = 0x000000;

  public readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.FADE_IN,
      durationMs: 250,
    },
  };
}
