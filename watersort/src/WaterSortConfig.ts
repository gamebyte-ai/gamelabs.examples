import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

export class WaterSortConfig {
  // Bottle dimensions
  readonly bottleWidth = 50;
  readonly bottleHeight = 180;
  readonly bottleGap = 16;
  readonly bottleRadius = 12;
  readonly bottleBorderColor = 0x4a5568;
  readonly bottleBorderWidth = 2;
  readonly bottleBgColor = 0x1a202c;
  readonly bottleBgAlpha = 0.6;
  readonly segmentHeight = 40;

  // Selection
  readonly selectedLiftY = 20;

  // Colors for liquids
  readonly liquidColors: number[] = [
    0xe53e3e, // red
    0x3182ce, // blue
    0x38a169, // green
    0xd69e2e, // yellow
    0x805ad5, // purple
    0xed8936, // orange
    0xe53e8c, // pink
    0x00b5d8, // cyan
    0x9f7aea, // lavender
    0x48bb78, // mint
  ];

  // Levels
  readonly segmentsPerBottle = 4;
  readonly startingColorCount = 3;
  readonly maxColorCount = 8;
  readonly emptyBottles = 2;
  readonly colorCountIncrement = 1;

  // Transitions
  readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0
    }
  };
}
