import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/** @panelConfig */
export class ArrowGameConfig {
  /** @panel {"type":"string","label":"Title","default":"Arrow Escape"} */
  public readonly title = "Arrow Escape";

  /** How fast an arrow slides out (grid cells per second). */
  /** @panel {"type":"number","label":"Slide speed","min":4,"max":30,"step":1,"group":"Feel","default":14} */
  public readonly slideSpeed = 14;
  /** Shake animation duration (seconds) when a move is blocked. */
  public readonly shakeDuration = 0.3;

  /** Palette used for arrows (indexed by the arrow's colorIndex). */
  public readonly arrowColors: readonly number[] = [
    0xff5a5f, // red
    0x4aa3ff, // blue
    0xffcf3f, // yellow
    0x5bd670, // green
    0xff934a, // orange
  ];

  // --- 2D drawing (pixi) ---
  /** Arrow line thickness as a fraction of a cell's pixel size (1 = fills a cell). */
  /** @panel {"type":"number","label":"Arrow Line Thickness","min":0.1,"max":1,"step":0.02,"group":"Look","default":0.52} */
  public readonly arrowThicknessRatio = 0.17;
  /** Grid dot radius as a fraction of a cell's pixel size. */
  public readonly dotRadiusRatio = 0.07;
  /** Grid dot color. */
  public readonly dotColor = 0xb9c2e6;
  /** Arrowhead size as a fraction of a cell's pixel size. */
  public readonly arrowSizeRatio = 0.62;
  /** Fraction of the shorter screen side the board may occupy (padding around it). */
  public readonly boardFitRatio = 0.86;

  public readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.FADE_IN,
      durationMs: 250,
    },
  };
}
