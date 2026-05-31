import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * Example-level configuration bucket.
 * Keep things here that are expected to change per project (transitions, tuning, etc.).
 */
export class ScreensConfig {
  public readonly transitions: {
    mainScreenIntro: ScreenTransition;
    mainScreenEnter: ScreenTransition;
    levelProgressScreenEnter: ScreenTransition;
  } = {
    mainScreenIntro: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0
    },
    mainScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.SLIDE_IN_UP,
      durationMs: 500
    },
    levelProgressScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.SLIDE_IN_DOWN,
      durationMs: 500
    }
  };
}

