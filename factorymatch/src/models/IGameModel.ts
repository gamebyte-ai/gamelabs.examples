import { InjectionToken } from "@gamebyte/gamelabsjs";

/** Matchable object kinds — one per imported 3D model. */
export type Kind = "dice" | "billardball" | "guitar" | "radio" | "gascan";

export type GameStatus = "playing" | "won" | "lost";

/** Readonly view of game state for the HUD controller. */
export interface IGameModel {
  readonly score: number;
  readonly status: GameStatus;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
