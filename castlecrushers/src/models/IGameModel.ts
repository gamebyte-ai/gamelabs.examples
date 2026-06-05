import { InjectionToken } from "@gamebyte/gamelabsjs";

/** What a piece looks like — the render descriptor half of a "prefab". */
export type PieceKind = "ground" | "pedestal" | "block" | "crown" | "ball";

export type PieceShape = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };

export type GameStatus = "playing" | "won" | "lost";

/** Readonly view of game state exposed to the controller (for HUD reconcile). */
export interface IGameModel {
  readonly ammoLeft: number;
  readonly status: GameStatus;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
