import { InjectionToken } from "@gamebyte/gamelabsjs";

/**
 * Readonly view of the player's game state (gold + base HP).
 *
 * Controllers receive this interface and never the mutable {@link GameState};
 * mutations are routed through `GameOperations` — controllers access model
 * state through readonly interfaces, not mutable model references.
 */
export interface IGameState {
  readonly gold: number;
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly kills: number;
  readonly waveNumber: number;
}

export const IGameState = new InjectionToken<IGameState>("IGameState");
