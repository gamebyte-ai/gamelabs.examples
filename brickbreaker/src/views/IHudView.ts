import type { IScreenView } from "@gamebyte/gamelabsjs";

/** In-game top HUD: the Time + Score readouts (visual only for now). */
export interface IHudView extends IScreenView {
  /** Set the Time readout text (e.g. "2:25"). */
  setTime(text: string): void;
  /** Set the Score readout text (e.g. "0"). */
  setScore(text: string): void;
  /** Show the game-over banner over the whole screen. */
  showGameOver(text: string): void;
}
