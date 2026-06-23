import { InjectionToken } from "@gamebyte/gamelabsjs";

/** Matchable object kinds — one per imported 3D model. */
export type Kind = "dice" | "billardball" | "guitar" | "radio" | "gascan";

export type GameStatus = "playing" | "won" | "lost";

/** Why the game was lost (drives which end banner shows). Null while not lost. */
export type LoseReason = "time" | "tray";

/** Readonly view of game state for the HUD controller. */
export interface IGameModel {
  readonly score: number;
  readonly status: GameStatus;
  readonly lostReason: LoseReason | null;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
