import { InjectionToken } from "@gamebyte/gamelabsjs";

import type { GameStatus, LoseReason } from "../constants/GameStatus.js";

/** Readonly view of game state for the HUD controller. */
export interface IGameModel {
  readonly score: number;
  readonly cash: number;
  readonly status: GameStatus;
  readonly lostReason: LoseReason | null;
  /** False during the start-of-game countdown; true once play begins. */
  readonly started: boolean;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
