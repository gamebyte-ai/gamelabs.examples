import { type IScreenView } from "@gamebyte/gamelabsjs";
import type { LevelDef } from "../constants/GameTypes";
import type { ArrowState } from "../utilities/GameState";

/**
 * The single game view (2D). Renders BOTH the HUD (level label, restart,
 * complete overlay) and the 2D board (dot grid + rope arrows + arrowheads).
 * The game is fully 2D — no 3D world view.
 */
export interface IGameScreenView extends IScreenView {
  // --- HUD ---
  setLevelLabel(level: number): void;
  /** Show the "level complete" overlay. `onNext` fires when the player taps NEXT. */
  showLevelComplete(onNext: () => void): void;
  hideLevelComplete(): void;
  /** Register a callback for the restart button. */
  onRestart(cb: () => void): void;

  // --- 2D board ---
  /** Build the dot grid + rope arrows for a level. */
  buildLevel(level: LevelDef, arrows: readonly ArrowState[]): void;
  /** Clear all board graphics. */
  clearLevel(): void;
  /** Register the handler invoked when the player taps a block (by id). */
  onArrowTapped(cb: (arrowId: number) => void): void;
  /** Animate a block sliding out (snake), then invoke onDone. */
  slideArrowOut(block: ArrowState, onDone: () => void): void;
  /** Play a short shake on a blocked block. */
  shakeArrow(arrowId: number): void;
}
