import type { IScreenView } from "@gamebyte/gamelabsjs";

/** End-of-game banner to show. */
export type GameResult = "allClear" | "timeUp" | "gameOver";

/** HUD view — UI only: score, countdown timer, goal chips and the end-of-game
 * banner. The 3D pile + slot rack live in the World view. */
export interface IFactoryScreenView extends IScreenView {
  setScore(score: number): void;
  setTime(text: string): void;
  setGoal(index: number, count: number): void;
  showResult(result: GameResult): void;
  hideBanner(): void;
}
