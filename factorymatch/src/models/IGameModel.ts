import { InjectionToken } from "@gamebyte/gamelabsjs";

/** Matchable shape kinds. */
export type Kind = "cube" | "cylinder" | "plus" | "triprism";

export type GameStatus = "playing" | "won" | "lost";

/** Readonly view of game state for the HUD controller. */
export interface IGameModel {
  readonly score: number;
  readonly status: GameStatus;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
